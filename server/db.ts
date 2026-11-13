import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

export function createDatabase(dbPath?: string): DatabaseSync {
  const resolvedPath =
    dbPath ?? process.env.SQLITE_DB_PATH ?? path.join(process.cwd(), 'data', 'smart_market.db');

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (resolvedPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  initSchema(db);
  return db;
}

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      market_location TEXT NOT NULL DEFAULT 'Main Market, Onitsha',
      city TEXT NOT NULL DEFAULT 'Onitsha',
      state TEXT NOT NULL DEFAULT 'Anambra',
      currency TEXT NOT NULL DEFAULT 'NGN',
      preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'ig')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS business_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'cashier')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, business_id)
    );

    CREATE TABLE IF NOT EXISTS product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (business_id, name)
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      market_location TEXT DEFAULT 'Onitsha Electronics Market',
      default_lead_time_days INTEGER NOT NULL DEFAULT 3 CHECK (default_lead_time_days >= 1),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'piece' CHECK (unit IN ('piece', 'pack', 'dozen', 'carton')),
      purchase_price REAL NOT NULL CHECK (purchase_price >= 0),
      selling_price REAL NOT NULL CHECK (selling_price >= 0),
      min_stock_level INTEGER NOT NULL DEFAULT 5 CHECK (min_stock_level >= 0),
      lead_time_days INTEGER NOT NULL DEFAULT 3 CHECK (lead_time_days >= 1),
      safety_stock INTEGER NOT NULL DEFAULT 5 CHECK (safety_stock >= 0),
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (business_id, sku)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
      current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      client_tx_id TEXT NOT NULL,
      receipt_number TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT 'Walk-in Customer',
      payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'pos', 'credit')),
      sale_type TEXT NOT NULL DEFAULT 'retail' CHECK (sale_type IN ('retail', 'wholesale')),
      total_revenue REAL NOT NULL CHECK (total_revenue >= 0),
      total_cost REAL NOT NULL CHECK (total_cost >= 0),
      gross_profit REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'returned', 'cancelled')),
      notes TEXT DEFAULT '',
      is_demo_synthetic INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (business_id, client_tx_id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_selling_price REAL NOT NULL CHECK (unit_selling_price >= 0),
      unit_cost_price REAL NOT NULL CHECK (unit_cost_price >= 0),
      line_total REAL NOT NULL CHECK (line_total >= 0),
      line_profit REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reference_code TEXT NOT NULL,
      total_cost REAL NOT NULL CHECK (total_cost >= 0),
      notes TEXT DEFAULT '',
      is_demo_synthetic INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
      line_total REAL NOT NULL CHECK (line_total >= 0)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'return', 'adjustment')),
      quantity_change INTEGER NOT NULL,
      stock_before INTEGER NOT NULL,
      stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
      unit_cost REAL NOT NULL DEFAULT 0,
      reference_id TEXT,
      note TEXT DEFAULT '',
      is_demo_synthetic INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      average_daily_demand REAL NOT NULL,
      forecast_7d REAL NOT NULL,
      forecast_30d REAL NOT NULL,
      mae REAL,
      insufficient_data INTEGER NOT NULL DEFAULT 0,
      explanation TEXT NOT NULL,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (business_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS restocking_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      reorder_point INTEGER NOT NULL,
      status TEXT NOT NULL,
      recommended_order_qty INTEGER NOT NULL,
      estimated_order_cost REAL NOT NULL,
      reason TEXT NOT NULL,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (business_id, product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
    CREATE INDEX IF NOT EXISTS idx_sales_business_date ON sales(business_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(business_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(business_id, product_id, created_at);
  `);
}

function isoDateDaysAgo(daysAgo: number, hour = 11, minute = 15): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function seedDemoBusinessIfEmpty(db: DatabaseSync): void {
  const existing = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get('demo@smartmarket.ng') as { id: number } | undefined;

  if (existing) return;

  const passwordHash = bcrypt.hashSync('DemoTrader2026!', 10);

  db.exec('BEGIN');
  try {
    const userRes = db
      .prepare(
        'INSERT INTO users (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)'
      )
      .run('Chinedu Okafor', 'demo@smartmarket.ng', '+234 803 412 8890', passwordHash);
    const userId = Number(userRes.lastInsertRowid);

    const bizRes = db
      .prepare(
        `INSERT INTO businesses (name, market_location, city, state, currency, preferred_language, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, 1)`
      )
      .run(
        'Chinedu Electronics & Phone Accessories',
        'Line 4, Emeka Offor Plaza, Main Market, Onitsha',
        'Onitsha',
        'Anambra',
        'NGN',
        'en'
      );
    const businessId = Number(bizRes.lastInsertRowid);

    db.prepare(
      'INSERT INTO business_memberships (user_id, business_id, role) VALUES (?, ?, ?)'
    ).run(userId, businessId, 'owner');

    const categoryNames = [
      'Chargers & Adapters',
      'Cables',
      'Audio & Earphones',
      'Power Banks',
      'Protection & Cases',
      'Electricals',
    ];
    const catMap = new Map<string, number>();
    const insertCat = db.prepare(
      'INSERT INTO product_categories (business_id, name) VALUES (?, ?)'
    );
    for (const c of categoryNames) {
      const r = insertCat.run(businessId, c);
      catMap.set(c, Number(r.lastInsertRowid));
    }

    const suppliersData = [
      {
        name: 'Alaba Direct Electronics Depot',
        phone: '+234 802 991 3400',
        loc: 'Alaba International Market, Lagos',
        lead: 4,
      },
      {
        name: 'Nnewi & Onitsha Accessories Hub',
        phone: '+234 806 544 1288',
        loc: 'Bridgehead Market, Onitsha',
        lead: 2,
      },
      {
        name: 'Kano & Aba Wholesale Distribution',
        phone: '+234 809 310 7742',
        loc: 'Upper Iweka Hub, Onitsha',
        lead: 3,
      },
    ];
    const supIds: number[] = [];
    const insertSup = db.prepare(
      `INSERT INTO suppliers (business_id, name, phone, market_location, default_lead_time_days)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const s of suppliersData) {
      const r = insertSup.run(businessId, s.name, s.phone, s.loc, s.lead);
      supIds.push(Number(r.lastInsertRowid));
    }

    const productsSeed = [
      {
        sku: 'SM-CHG-001',
        name: 'Oraimo 20W Type-C Fast Charger',
        category: 'Chargers & Adapters',
        supplierIdx: 0,
        unit: 'piece',
        purchasePrice: 3200,
        sellingPrice: 4500,
        currentStock: 34,
        minStock: 12,
        leadTime: 4,
        safetyStock: 10,
        pattern: 'steady_fast', // ~4/day
      },
      {
        sku: 'SM-CBL-002',
        name: 'Braided USB-C to Type-C Cable 1.5m',
        category: 'Cables',
        supplierIdx: 1,
        unit: 'piece',
        purchasePrice: 950,
        sellingPrice: 1800,
        currentStock: 8, // Triggers Restock immediately!
        minStock: 15,
        leadTime: 3,
        safetyStock: 12,
        pattern: 'very_fast', // ~6/day
      },
      {
        sku: 'SM-AUD-003',
        name: 'Infinix XE27 Wireless Earbuds',
        category: 'Audio & Earphones',
        supplierIdx: 0,
        unit: 'piece',
        purchasePrice: 9500,
        sellingPrice: 13500,
        currentStock: 19,
        minStock: 6,
        leadTime: 4,
        safetyStock: 6,
        pattern: 'medium', // ~1.4/day
      },
      {
        sku: 'SM-PWR-004',
        name: 'New Age 20,000mAh Power Bank',
        category: 'Power Banks',
        supplierIdx: 0,
        unit: 'piece',
        purchasePrice: 14200,
        sellingPrice: 18500,
        currentStock: 13, // Triggers Restock soon!
        minStock: 8,
        leadTime: 4,
        safetyStock: 6,
        pattern: 'medium_fast', // ~2.1/day
      },
      {
        sku: 'SM-PRT-005',
        name: '9D Tempered Glass Screen Protector (Pack of 10)',
        category: 'Protection & Cases',
        supplierIdx: 1,
        unit: 'pack',
        purchasePrice: 2400,
        sellingPrice: 4000,
        currentStock: 4, // Triggers Restock immediately!
        minStock: 8,
        leadTime: 2,
        safetyStock: 5,
        pattern: 'steady_fast', // ~3/day
      },
      {
        sku: 'SM-CAS-006',
        name: 'Matte Silicone Phone Case (Dozen)',
        category: 'Protection & Cases',
        supplierIdx: 2,
        unit: 'dozen',
        purchasePrice: 4800,
        sellingPrice: 7200,
        currentStock: 75, // Potential overstock!
        minStock: 6,
        leadTime: 3,
        safetyStock: 4,
        pattern: 'slow', // ~0.5/day
      },
      {
        sku: 'SM-SPK-007',
        name: 'Portable Waterproof Bluetooth Speaker',
        category: 'Audio & Earphones',
        supplierIdx: 0,
        unit: 'piece',
        purchasePrice: 11500,
        sellingPrice: 16000,
        currentStock: 14,
        minStock: 4,
        leadTime: 5,
        safetyStock: 3,
        pattern: 'very_slow', // ~0.2/day -> Product is moving slowly
      },
      {
        sku: 'SM-EXT-008',
        name: '4-Way Surge Extension Box 3m',
        category: 'Electricals',
        supplierIdx: 2,
        unit: 'piece',
        purchasePrice: 3600,
        sellingPrice: 5200,
        currentStock: 28,
        minStock: 10,
        leadTime: 3,
        safetyStock: 8,
        pattern: 'medium', // ~1.6/day
      },
      {
        sku: 'SM-ADP-009',
        name: 'UK 3-Pin Heavy Duty Travel Adapter',
        category: 'Chargers & Adapters',
        supplierIdx: 1,
        unit: 'piece',
        purchasePrice: 750,
        sellingPrice: 1400,
        currentStock: 0, // Out of stock -> Restock immediately!
        minStock: 12,
        leadTime: 2,
        safetyStock: 8,
        pattern: 'steady_fast',
      },
      {
        sku: 'SM-CAR-010',
        name: '45W Dual-Port Fast Car Charger',
        category: 'Chargers & Adapters',
        supplierIdx: 0,
        unit: 'piece',
        purchasePrice: 4100,
        sellingPrice: 6000,
        currentStock: 12,
        minStock: 5,
        leadTime: 4,
        safetyStock: 4,
        pattern: 'new_insufficient', // Only 2 days of sales -> Insufficient Data fallback
      },
    ];

    const insertedProducts: Array<{
      id: number;
      sku: string;
      name: string;
      unit: string;
      purchasePrice: number;
      sellingPrice: number;
      currentStock: number;
      pattern: string;
    }> = [];

    const insertProd = db.prepare(
      `INSERT INTO products
       (business_id, category_id, supplier_id, sku, name, unit, purchase_price, selling_price, min_stock_level, lead_time_days, safety_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertInv = db.prepare(
      'INSERT INTO inventory (business_id, product_id, current_stock) VALUES (?, ?, ?)'
    );

    for (const p of productsSeed) {
      const r = insertProd.run(
        businessId,
        catMap.get(p.category) ?? null,
        supIds[p.supplierIdx],
        p.sku,
        p.name,
        p.unit,
        p.purchasePrice,
        p.sellingPrice,
        p.minStock,
        p.leadTime,
        p.safetyStock
      );
      const pid = Number(r.lastInsertRowid);
      insertInv.run(businessId, pid, p.currentStock);
      insertedProducts.push({
        id: pid,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        currentStock: p.currentStock,
        pattern: p.pattern,
      });
    }

    // Seed initial opening stock purchase record 46 days ago
    const openingTimestamp = isoDateDaysAgo(46, 9, 0);
    const purchRes = db
      .prepare(
        `INSERT INTO purchases (business_id, supplier_id, user_id, reference_code, total_cost, notes, is_demo_synthetic, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(
        businessId,
        supIds[0],
        userId,
        'PO-DEMO-OPENING',
        1850000,
        'Synthetic demo opening stock batch for Onitsha Main Market shop',
        openingTimestamp
      );
    const openingPurchaseId = Number(purchRes.lastInsertRowid);

    const insertPurchItem = db.prepare(
      `INSERT INTO purchase_items (purchase_id, business_id, product_id, quantity, unit_cost, line_total)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertMove = db.prepare(
      `INSERT INTO stock_movements
       (business_id, product_id, movement_type, quantity_change, stock_before, stock_after, unit_cost, reference_id, note, is_demo_synthetic, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );

    // Track simulated running stock backwards or build daily synthetic sales for past 45 days
    const paymentMethods = ['cash', 'bank_transfer', 'pos', 'cash', 'bank_transfer'];
    const customers = [
      'Walk-in Customer',
      'Emeka Phone Hub',
      'Ngozi Telecoms',
      'Obinna Plaza Buyer',
      'Walk-in Customer',
      'Ify Accessories Wholesale',
    ];

    // Deterministic pseudo-random helper so demo dataset is reproducible
    let seed = 4219;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const dailyProductSold = new Map<number, number>();
    const saleInserts: Array<{
      daysAgo: number;
      hour: number;
      minute: number;
      customer: string;
      payment: string;
      saleType: string;
      items: Array<{ prodIdx: number; qty: number }>;
    }> = [];

    for (let daysAgo = 44; daysAgo >= 0; daysAgo--) {
      const dt = new Date();
      dt.setUTCDate(dt.getUTCDate() - daysAgo);
      const dow = dt.getUTCDay();
      // Onitsha Main Market: closed/very quiet Sunday (0), busy Mon (1), Fri (5), Sat (6)
      const marketFactor =
        dow === 0 ? 0.15 : dow === 1 || dow === 5 || dow === 6 ? 1.45 : 0.95;

      const dailyOrdersCount = dow === 0 ? (nextRand() > 0.65 ? 1 : 0) : Math.floor(2 + nextRand() * 3 * marketFactor);

      // Build line items per day across products based on their demand profile
      const dayItems: Array<{ prodIdx: number; qty: number }> = [];
      insertedProducts.forEach((p, idx) => {
        if (daysAgo === 0 && p.currentStock === 0) return;
        let expected = 0;
        switch (p.pattern) {
          case 'very_fast':
            expected = 5.5 * marketFactor;
            break;
          case 'steady_fast':
            expected = 3.2 * marketFactor;
            break;
          case 'medium_fast':
            expected = 2.1 * marketFactor;
            break;
          case 'medium':
            expected = 1.5 * marketFactor;
            break;
          case 'slow':
            expected = 0.45 * marketFactor;
            break;
          case 'very_slow':
            expected = 0.2 * marketFactor;
            break;
          case 'new_insufficient':
            expected = daysAgo <= 2 ? 1.5 : 0;
            break;
        }
        if (dow === 0 && p.pattern !== 'new_insufficient') {
          expected *= 0.2;
        }
        const rawQty = Math.floor(expected + (nextRand() - 0.3) * Math.max(1, expected * 0.7));
        const qty = Math.max(0, rawQty);
        if (qty > 0) {
          dayItems.push({ prodIdx: idx, qty });
          dailyProductSold.set(p.id, (dailyProductSold.get(p.id) ?? 0) + qty);
        }
      });

      if (dayItems.length > 0) {
        // Split dayItems across 1..3 receipts for realistic transaction granularity
        const buckets = Math.max(1, Math.min(dailyOrdersCount, dayItems.length));
        for (let b = 0; b < buckets; b++) {
          const bucketItems = dayItems.filter((_, i) => i % buckets === b);
          if (bucketItems.length === 0) continue;
          const totalQty = bucketItems.reduce((s, it) => s + it.qty, 0);
          const nowUtc = new Date();
          let saleHour = 9 + Math.floor(nextRand() * 8);
          let saleMinute = Math.floor(nextRand() * 59);
          if (daysAgo === 0) {
            const curH = nowUtc.getUTCHours();
            const curM = nowUtc.getUTCMinutes();
            if (curH === 0) {
              saleHour = 0;
              saleMinute = Math.min(saleMinute, Math.max(0, curM - 5));
            } else {
              saleHour = Math.min(saleHour, curH - 1);
            }
          }
          saleInserts.push({
            daysAgo,
            hour: saleHour,
            minute: saleMinute,
            customer: customers[Math.floor(nextRand() * customers.length)],
            payment: paymentMethods[Math.floor(nextRand() * paymentMethods.length)],
            saleType: totalQty >= 6 ? 'wholesale' : 'retail',
            items: bucketItems,
          });
        }
      }
    }

    // Seed opening stock movements that reconcile cleanly to currentStock
    const runningStock = new Map<number, number>();
    for (const p of insertedProducts) {
      const soldTotal = dailyProductSold.get(p.id) ?? 0;
      const initialStock = p.currentStock + soldTotal;
      runningStock.set(p.id, initialStock);
      insertPurchItem.run(
        openingPurchaseId,
        businessId,
        p.id,
        initialStock,
        p.purchasePrice,
        initialStock * p.purchasePrice
      );
      insertMove.run(
        businessId,
        p.id,
        'purchase',
        initialStock,
        0,
        initialStock,
        p.purchasePrice,
        'PO-DEMO-OPENING',
        'Demo opening inventory batch',
        openingTimestamp
      );
    }

    const insertSale = db.prepare(
      `INSERT INTO sales
       (business_id, user_id, client_tx_id, receipt_number, customer_name, payment_method, sale_type, total_revenue, total_cost, gross_profit, status, notes, is_demo_synthetic, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, 1, ?)`
    );
    const insertSaleItem = db.prepare(
      `INSERT INTO sale_items
       (sale_id, business_id, product_id, product_name, sku, unit, quantity, unit_selling_price, unit_cost_price, line_total, line_profit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let receiptSeq = 1001;
    for (const s of saleInserts) {
      let rev = 0;
      let cost = 0;
      for (const it of s.items) {
        const prod = insertedProducts[it.prodIdx];
        rev += prod.sellingPrice * it.qty;
        cost += prod.purchasePrice * it.qty;
      }
      const profit = rev - cost;
      const ts = isoDateDaysAgo(s.daysAgo, s.hour, s.minute);
      const receiptNo = `SM-${receiptSeq++}`;
      const clientTxId = `demo-tx-${receiptNo}`;

      const saleRes = insertSale.run(
        businessId,
        userId,
        clientTxId,
        receiptNo,
        s.customer,
        s.payment,
        s.saleType,
        rev,
        cost,
        profit,
        'Synthetic demo transaction',
        ts
      );
      const saleId = Number(saleRes.lastInsertRowid);

      for (const it of s.items) {
        const prod = insertedProducts[it.prodIdx];
        const lineTotal = prod.sellingPrice * it.qty;
        const lineProfit = (prod.sellingPrice - prod.purchasePrice) * it.qty;
        insertSaleItem.run(
          saleId,
          businessId,
          prod.id,
          prod.name,
          prod.sku,
          prod.unit,
          it.qty,
          prod.sellingPrice,
          prod.purchasePrice,
          lineTotal,
          lineProfit
        );

        const before = runningStock.get(prod.id) ?? 0;
        const after = Math.max(0, before - it.qty);
        runningStock.set(prod.id, after);
        insertMove.run(
          businessId,
          prod.id,
          'sale',
          -it.qty,
          before,
          after,
          prod.purchasePrice,
          receiptNo,
          `Demo sale to ${s.customer}`,
          ts
        );
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
