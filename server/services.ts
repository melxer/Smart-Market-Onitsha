import type { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type {
  Business,
  Category,
  DashboardSummary,
  PaymentMethod,
  Product,
  ProductForecast,
  RestockingRecommendation,
  Sale,
  SaleItem,
  StockMovement,
  Supplier,
  UnitType,
  User,
} from '../src/types/index.ts';
import {
  computeRestockingRecommendation,
  generateProductForecast,
  type DailySaleRecord,
} from './forecasting.ts';

const JWT_SECRET =
  process.env.JWT_SECRET ?? 'smart-market-dev-secret-change-in-production';

export interface AuthTokenPayload {
  userId: number;
  businessId: number;
  email: string;
  role: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

export function registerUserAndBusiness(
  db: DatabaseSync,
  input: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    businessName: string;
    marketLocation?: string;
  }
): { token: string; user: User; business: Business } {
  const email = input.email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const passwordHash = bcrypt.hashSync(input.password, 10);

  db.exec('BEGIN');
  try {
    const uRes = db
      .prepare(
        'INSERT INTO users (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)'
      )
      .run(input.fullName.trim(), email, (input.phone ?? '').trim(), passwordHash);
    const userId = Number(uRes.lastInsertRowid);

    const bRes = db
      .prepare(
        `INSERT INTO businesses (name, market_location, city, state, currency, preferred_language, is_demo)
         VALUES (?, ?, 'Onitsha', 'Anambra', 'NGN', 'en', 0)`
      )
      .run(
        input.businessName.trim(),
        (input.marketLocation ?? 'Main Market, Onitsha').trim()
      );
    const businessId = Number(bRes.lastInsertRowid);

    db.prepare(
      'INSERT INTO business_memberships (user_id, business_id, role) VALUES (?, ?, ?)'
    ).run(userId, businessId, 'owner');

    // Seed default categories & supplier for new business
    const defaultCats = ['General Merchandise', 'Electronics', 'Accessories', 'Electricals'];
    const insertCat = db.prepare(
      'INSERT INTO product_categories (business_id, name) VALUES (?, ?)'
    );
    for (const c of defaultCats) insertCat.run(businessId, c);

    db.prepare(
      `INSERT INTO suppliers (business_id, name, phone, market_location, default_lead_time_days)
       VALUES (?, 'Main Market Wholesale Supplier', '', 'Onitsha, Anambra', 3)`
    ).run(businessId);

    db.exec('COMMIT');

    const user: User = {
      id: userId,
      fullName: input.fullName.trim(),
      email,
      phone: (input.phone ?? '').trim(),
      role: 'owner',
    };
    const business = getBusinessById(db, businessId)!;
    const token = signAuthToken({ userId, businessId, email, role: 'owner' });
    return { token, user, business };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function loginUser(
  db: DatabaseSync,
  emailInput: string,
  password: string
): { token: string; user: User; business: Business } {
  const email = emailInput.trim().toLowerCase();
  const row = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.phone, u.password_hash,
              m.business_id, m.role
       FROM users u
       JOIN business_memberships m ON m.user_id = u.id
       WHERE u.email = ?
       ORDER BY m.id ASC
       LIMIT 1`
    )
    .get(email) as
    | {
        id: number;
        full_name: string;
        email: string;
        phone: string;
        password_hash: string;
        business_id: number;
        role: string;
      }
    | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw new Error('Invalid email or password.');
  }

  const business = getBusinessById(db, row.business_id);
  if (!business) {
    throw new Error('Business profile not found.');
  }

  const user: User = {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
  };
  const token = signAuthToken({
    userId: row.id,
    businessId: row.business_id,
    email: row.email,
    role: row.role,
  });

  return { token, user, business };
}

export function getBusinessById(db: DatabaseSync, businessId: number): Business | null {
  const row = db
    .prepare(
      `SELECT id, name, market_location, city, state, currency, preferred_language, is_demo
       FROM businesses WHERE id = ?`
    )
    .get(businessId) as
    | {
        id: number;
        name: string;
        market_location: string;
        city: string;
        state: string;
        currency: string;
        preferred_language: 'en' | 'ig';
        is_demo: number;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    marketLocation: row.market_location,
    city: row.city,
    state: row.state,
    currency: row.currency,
    preferredLanguage: row.preferred_language,
    isDemo: row.is_demo === 1,
  };
}

export function updateBusinessProfile(
  db: DatabaseSync,
  businessId: number,
  updates: { name?: string; marketLocation?: string; preferredLanguage?: 'en' | 'ig' }
): Business {
  const current = getBusinessById(db, businessId);
  if (!current) throw new Error('Business not found.');
  db.prepare(
    `UPDATE businesses
     SET name = ?, market_location = ?, preferred_language = ?
     WHERE id = ?`
  ).run(
    updates.name?.trim() || current.name,
    updates.marketLocation?.trim() || current.marketLocation,
    updates.preferredLanguage ?? current.preferredLanguage,
    businessId
  );
  return getBusinessById(db, businessId)!;
}

export function listCategories(db: DatabaseSync, businessId: number): Category[] {
  const rows = db
    .prepare(
      'SELECT id, business_id, name FROM product_categories WHERE business_id = ? ORDER BY name ASC'
    )
    .all(businessId) as Array<{ id: number; business_id: number; name: string }>;
  return rows.map((r) => ({ id: r.id, businessId: r.business_id, name: r.name }));
}

export function listSuppliers(db: DatabaseSync, businessId: number): Supplier[] {
  const rows = db
    .prepare(
      `SELECT id, business_id, name, phone, market_location, default_lead_time_days
       FROM suppliers WHERE business_id = ? ORDER BY name ASC`
    )
    .all(businessId) as Array<{
    id: number;
    business_id: number;
    name: string;
    phone: string;
    market_location: string;
    default_lead_time_days: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    name: r.name,
    phone: r.phone,
    marketLocation: r.market_location,
    defaultLeadTimeDays: r.default_lead_time_days,
  }));
}

export function listProducts(
  db: DatabaseSync,
  businessId: number,
  includeArchived = true
): Product[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.business_id, p.category_id, COALESCE(c.name, 'Uncategorized') AS category_name,
              p.supplier_id, COALESCE(s.name, 'Direct Purchase') AS supplier_name,
              p.sku, p.name, p.unit, p.purchase_price, p.selling_price,
              COALESCE(i.current_stock, 0) AS current_stock,
              p.min_stock_level, p.lead_time_days, p.safety_stock, p.is_archived, p.updated_at
       FROM products p
       LEFT JOIN product_categories c ON c.id = p.category_id AND c.business_id = p.business_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.business_id = p.business_id
       LEFT JOIN inventory i ON i.product_id = p.id AND i.business_id = p.business_id
       WHERE p.business_id = ? ${includeArchived ? '' : 'AND p.is_archived = 0'}
       ORDER BY p.is_archived ASC, p.name ASC`
    )
    .all(businessId) as Array<{
    id: number;
    business_id: number;
    category_id: number | null;
    category_name: string;
    supplier_id: number | null;
    supplier_name: string;
    sku: string;
    name: string;
    unit: UnitType;
    purchase_price: number;
    selling_price: number;
    current_stock: number;
    min_stock_level: number;
    lead_time_days: number;
    safety_stock: number;
    is_archived: number;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    categoryId: r.category_id,
    categoryName: r.category_name,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    sku: r.sku,
    name: r.name,
    unit: r.unit,
    purchasePrice: r.purchase_price,
    sellingPrice: r.selling_price,
    currentStock: r.current_stock,
    minStockLevel: r.min_stock_level,
    leadTimeDays: r.lead_time_days,
    safetyStock: r.safety_stock,
    isArchived: r.is_archived === 1,
    updatedAt: r.updated_at,
  }));
}

export function getProductById(
  db: DatabaseSync,
  businessId: number,
  productId: number
): Product | null {
  const all = listProducts(db, businessId, true);
  return all.find((p) => p.id === productId) ?? null;
}

export function createProduct(
  db: DatabaseSync,
  businessId: number,
  input: {
    sku: string;
    name: string;
    categoryName?: string;
    categoryId?: number | null;
    supplierId?: number | null;
    unit: UnitType;
    purchasePrice: number;
    sellingPrice: number;
    initialStock: number;
    minStockLevel: number;
    leadTimeDays: number;
    safetyStock: number;
  }
): Product {
  if (!input.name.trim()) throw new Error('Product name is required.');
  if (input.purchasePrice < 0 || input.sellingPrice < 0) {
    throw new Error('Prices cannot be negative.');
  }
  if (input.initialStock < 0) {
    throw new Error('Initial stock cannot be negative.');
  }

  const sku =
    input.sku.trim() ||
    `SM-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString().slice(-3)}`;

  db.exec('BEGIN');
  try {
    let categoryId = input.categoryId ?? null;
    if (!categoryId && input.categoryName?.trim()) {
      const catName = input.categoryName.trim();
      const existingCat = db
        .prepare('SELECT id FROM product_categories WHERE business_id = ? AND name = ?')
        .get(businessId, catName) as { id: number } | undefined;
      if (existingCat) {
        categoryId = existingCat.id;
      } else {
        const cRes = db
          .prepare('INSERT INTO product_categories (business_id, name) VALUES (?, ?)')
          .run(businessId, catName);
        categoryId = Number(cRes.lastInsertRowid);
      }
    }

    const res = db
      .prepare(
        `INSERT INTO products
         (business_id, category_id, supplier_id, sku, name, unit, purchase_price, selling_price, min_stock_level, lead_time_days, safety_stock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        businessId,
        categoryId,
        input.supplierId ?? null,
        sku,
        input.name.trim(),
        input.unit,
        input.purchasePrice,
        input.sellingPrice,
        Math.max(0, Math.floor(input.minStockLevel)),
        Math.max(1, Math.floor(input.leadTimeDays)),
        Math.max(0, Math.floor(input.safetyStock))
      );

    const productId = Number(res.lastInsertRowid);
    const qty = Math.max(0, Math.floor(input.initialStock));

    db.prepare(
      'INSERT INTO inventory (business_id, product_id, current_stock) VALUES (?, ?, ?)'
    ).run(businessId, productId, qty);

    if (qty > 0) {
      db.prepare(
        `INSERT INTO stock_movements
         (business_id, product_id, movement_type, quantity_change, stock_before, stock_after, unit_cost, reference_id, note)
         VALUES (?, ?, 'purchase', ?, 0, ?, ?, 'OPENING', 'Initial opening stock')`
      ).run(businessId, productId, qty, qty, input.purchasePrice);
    }

    db.exec('COMMIT');
    return getProductById(db, businessId, productId)!;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function updateProduct(
  db: DatabaseSync,
  businessId: number,
  productId: number,
  input: Partial<{
    sku: string;
    name: string;
    categoryId: number | null;
    categoryName: string;
    supplierId: number | null;
    unit: UnitType;
    purchasePrice: number;
    sellingPrice: number;
    minStockLevel: number;
    leadTimeDays: number;
    safetyStock: number;
    isArchived: boolean;
  }>
): Product {
  const current = getProductById(db, businessId, productId);
  if (!current) throw new Error('Product not found.');

  let categoryId = input.categoryId !== undefined ? input.categoryId : current.categoryId;
  if (input.categoryName?.trim()) {
    const existingCat = db
      .prepare('SELECT id FROM product_categories WHERE business_id = ? AND name = ?')
      .get(businessId, input.categoryName.trim()) as { id: number } | undefined;
    if (existingCat) {
      categoryId = existingCat.id;
    } else {
      const cRes = db
        .prepare('INSERT INTO product_categories (business_id, name) VALUES (?, ?)')
        .run(businessId, input.categoryName.trim());
      categoryId = Number(cRes.lastInsertRowid);
    }
  }

  db.prepare(
    `UPDATE products
     SET sku = ?, name = ?, category_id = ?, supplier_id = ?, unit = ?,
         purchase_price = ?, selling_price = ?, min_stock_level = ?,
         lead_time_days = ?, safety_stock = ?, is_archived = ?, updated_at = datetime('now')
     WHERE id = ? AND business_id = ?`
  ).run(
    input.sku?.trim() || current.sku,
    input.name?.trim() || current.name,
    categoryId,
    input.supplierId !== undefined ? input.supplierId : current.supplierId,
    input.unit ?? current.unit,
    input.purchasePrice ?? current.purchasePrice,
    input.sellingPrice ?? current.sellingPrice,
    input.minStockLevel ?? current.minStockLevel,
    input.leadTimeDays ?? current.leadTimeDays,
    input.safetyStock ?? current.safetyStock,
    input.isArchived !== undefined ? (input.isArchived ? 1 : 0) : current.isArchived ? 1 : 0,
    productId,
    businessId
  );

  return getProductById(db, businessId, productId)!;
}

export function deleteOrArchiveProduct(
  db: DatabaseSync,
  businessId: number,
  productId: number
): { action: 'deleted' | 'archived' } {
  const current = getProductById(db, businessId, productId);
  if (!current) throw new Error('Product not found.');

  const usedInSales = db
    .prepare('SELECT COUNT(*) AS cnt FROM sale_items WHERE business_id = ? AND product_id = ?')
    .get(businessId, productId) as { cnt: number };

  if (usedInSales.cnt > 0) {
    db.prepare(
      "UPDATE products SET is_archived = 1, updated_at = datetime('now') WHERE id = ? AND business_id = ?"
    ).run(productId, businessId);
    return { action: 'archived' };
  }

  db.prepare('DELETE FROM products WHERE id = ? AND business_id = ?').run(
    productId,
    businessId
  );
  return { action: 'deleted' };
}

export function adjustStockTx(
  db: DatabaseSync,
  businessId: number,
  productId: number,
  quantityChange: number,
  note: string
): Product {
  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    throw new Error('Quantity adjustment must be a non-zero integer.');
  }

  db.exec('BEGIN');
  try {
    const row = db
      .prepare(
        `SELECT i.current_stock, p.purchase_price
         FROM inventory i
         JOIN products p ON p.id = i.product_id
         WHERE i.business_id = ? AND i.product_id = ?`
      )
      .get(businessId, productId) as
      | { current_stock: number; purchase_price: number }
      | undefined;

    if (!row) throw new Error('Inventory record not found.');
    const nextStock = row.current_stock + quantityChange;
    if (nextStock < 0) {
      throw new Error(
        `Insufficient stock: cannot reduce below 0 (current stock: ${row.current_stock}).`
      );
    }

    db.prepare(
      "UPDATE inventory SET current_stock = ?, updated_at = datetime('now') WHERE business_id = ? AND product_id = ?"
    ).run(nextStock, businessId, productId);

    db.prepare(
      `INSERT INTO stock_movements
       (business_id, product_id, movement_type, quantity_change, stock_before, stock_after, unit_cost, reference_id, note)
       VALUES (?, ?, 'adjustment', ?, ?, ?, ?, 'ADJ', ?)`
    ).run(
      businessId,
      productId,
      quantityChange,
      row.current_stock,
      nextStock,
      row.purchase_price,
      note.trim() || 'Manual stock adjustment'
    );

    db.exec('COMMIT');
    return getProductById(db, businessId, productId)!;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function recordPurchaseTx(
  db: DatabaseSync,
  businessId: number,
  userId: number | null,
  input: {
    supplierId?: number | null;
    notes?: string;
    items: Array<{ productId: number; quantity: number; unitCost?: number }>;
  }
): { purchaseId: number; referenceCode: string; totalCost: number } {
  if (!input.items || input.items.length === 0) {
    throw new Error('At least one product is required for a restock purchase.');
  }

  const refCode = `PO-${Date.now().toString().slice(-6)}`;

  db.exec('BEGIN');
  try {
    let totalCost = 0;
    const resolvedItems: Array<{
      productId: number;
      quantity: number;
      unitCost: number;
      stockBefore: number;
    }> = [];

    for (const item of input.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error('Purchase quantity must be greater than zero.');
      }
      const pRow = db
        .prepare(
          `SELECT p.id, p.purchase_price, i.current_stock
           FROM products p
           JOIN inventory i ON i.product_id = p.id
           WHERE p.id = ? AND p.business_id = ?`
        )
        .get(item.productId, businessId) as
        | { id: number; purchase_price: number; current_stock: number }
        | undefined;
      if (!pRow) throw new Error(`Product ${item.productId} not found in business.`);
      const cost = item.unitCost !== undefined && item.unitCost >= 0 ? item.unitCost : pRow.purchase_price;
      totalCost += cost * item.quantity;
      resolvedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitCost: cost,
        stockBefore: pRow.current_stock,
      });
    }

    const pRes = db
      .prepare(
        `INSERT INTO purchases (business_id, supplier_id, user_id, reference_code, total_cost, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        businessId,
        input.supplierId ?? null,
        userId,
        refCode,
        totalCost,
        (input.notes ?? '').trim()
      );
    const purchaseId = Number(pRes.lastInsertRowid);

    const insItem = db.prepare(
      `INSERT INTO purchase_items (purchase_id, business_id, product_id, quantity, unit_cost, line_total)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const updInv = db.prepare(
      "UPDATE inventory SET current_stock = ?, updated_at = datetime('now') WHERE business_id = ? AND product_id = ?"
    );
    const updProdCost = db.prepare(
      "UPDATE products SET purchase_price = ?, updated_at = datetime('now') WHERE id = ? AND business_id = ?"
    );
    const insMove = db.prepare(
      `INSERT INTO stock_movements
       (business_id, product_id, movement_type, quantity_change, stock_before, stock_after, unit_cost, reference_id, note)
       VALUES (?, ?, 'purchase', ?, ?, ?, ?, ?, ?)`
    );

    for (const item of resolvedItems) {
      const nextStock = item.stockBefore + item.quantity;
      insItem.run(
        purchaseId,
        businessId,
        item.productId,
        item.quantity,
        item.unitCost,
        item.quantity * item.unitCost
      );
      updInv.run(nextStock, businessId, item.productId);
      updProdCost.run(item.unitCost, item.productId, businessId);
      insMove.run(
        businessId,
        item.productId,
        item.quantity,
        item.stockBefore,
        nextStock,
        item.unitCost,
        refCode,
        input.notes?.trim() || `Restock batch ${refCode}`
      );
    }

    db.exec('COMMIT');
    return { purchaseId, referenceCode: refCode, totalCost };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getStockMovements(
  db: DatabaseSync,
  businessId: number,
  productId?: number,
  limit = 100
): StockMovement[] {
  const query = productId
    ? `SELECT sm.id, sm.business_id, sm.product_id, p.name AS product_name,
              sm.movement_type, sm.quantity_change, sm.stock_before, sm.stock_after,
              sm.unit_cost, sm.reference_id, sm.note, sm.is_demo_synthetic, sm.created_at
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       WHERE sm.business_id = ? AND sm.product_id = ?
       ORDER BY sm.created_at DESC, sm.id DESC
       LIMIT ?`
    : `SELECT sm.id, sm.business_id, sm.product_id, p.name AS product_name,
              sm.movement_type, sm.quantity_change, sm.stock_before, sm.stock_after,
              sm.unit_cost, sm.reference_id, sm.note, sm.is_demo_synthetic, sm.created_at
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       WHERE sm.business_id = ?
       ORDER BY sm.created_at DESC, sm.id DESC
       LIMIT ?`;

  const rows = (
    productId
      ? db.prepare(query).all(businessId, productId, limit)
      : db.prepare(query).all(businessId, limit)
  ) as Array<{
    id: number;
    business_id: number;
    product_id: number;
    product_name: string;
    movement_type: 'purchase' | 'sale' | 'return' | 'adjustment';
    quantity_change: number;
    stock_before: number;
    stock_after: number;
    unit_cost: number;
    reference_id: string | null;
    note: string;
    is_demo_synthetic: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    productId: r.product_id,
    productName: r.product_name,
    movementType: r.movement_type,
    quantityChange: r.quantity_change,
    stockBefore: r.stock_before,
    stockAfter: r.stock_after,
    unitCost: r.unit_cost,
    referenceId: r.reference_id,
    note: r.note,
    isDemoSynthetic: r.is_demo_synthetic === 1,
    createdAt: r.created_at,
  }));
}

export interface CreateSaleInput {
  clientTxId?: string;
  customerName?: string;
  paymentMethod: PaymentMethod;
  saleType?: 'retail' | 'wholesale';
  notes?: string;
  createdAt?: string;
  items: Array<{
    productId: number;
    quantity: number;
    unitSellingPrice?: number;
  }>;
}

export function recordSaleTx(
  db: DatabaseSync,
  businessId: number,
  userId: number | null,
  input: CreateSaleInput
): { sale: Sale; duplicate: boolean } {
  if (!input.items || input.items.length === 0) {
    throw new Error('Cannot record a sale with zero items.');
  }

  const clientTxId =
    input.clientTxId?.trim() ||
    `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Idempotency check to prevent duplicate transactions during offline sync
  const existingSale = db
    .prepare('SELECT id FROM sales WHERE business_id = ? AND client_tx_id = ?')
    .get(businessId, clientTxId) as { id: number } | undefined;

  if (existingSale) {
    return { sale: getSaleById(db, businessId, existingSale.id)!, duplicate: true };
  }

  // Merge duplicate productIds in the same cart cleanly
  const merged = new Map<number, { quantity: number; unitSellingPrice?: number }>();
  for (const it of input.items) {
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
      throw new Error('Item quantity must be a positive integer.');
    }
    const prev = merged.get(it.productId);
    merged.set(it.productId, {
      quantity: (prev?.quantity ?? 0) + it.quantity,
      unitSellingPrice: it.unitSellingPrice ?? prev?.unitSellingPrice,
    });
  }

  db.exec('BEGIN');
  try {
    let totalRevenue = 0;
    let totalCost = 0;

    const preparedItems: Array<{
      productId: number;
      productName: string;
      sku: string;
      unit: UnitType;
      quantity: number;
      unitSellingPrice: number;
      unitCostPrice: number;
      lineTotal: number;
      lineProfit: number;
      stockBefore: number;
    }> = [];

    for (const [productId, spec] of merged.entries()) {
      const pRow = db
        .prepare(
          `SELECT p.id, p.name, p.sku, p.unit, p.purchase_price, p.selling_price, p.is_archived,
                  i.current_stock
           FROM products p
           JOIN inventory i ON i.product_id = p.id
           WHERE p.id = ? AND p.business_id = ?`
        )
        .get(productId, businessId) as
        | {
            id: number;
            name: string;
            sku: string;
            unit: UnitType;
            purchase_price: number;
            selling_price: number;
            is_archived: number;
            current_stock: number;
          }
        | undefined;

      if (!pRow) {
        throw new Error(`Product #${productId} does not belong to this business.`);
      }
      if (pRow.is_archived === 1) {
        throw new Error(`Product "${pRow.name}" is archived and cannot be sold.`);
      }
      if (pRow.current_stock < spec.quantity) {
        throw new Error(
          `Insufficient stock for "${pRow.name}": available ${pRow.current_stock}, requested ${spec.quantity}.`
        );
      }

      const sellPrice =
        spec.unitSellingPrice !== undefined && spec.unitSellingPrice >= 0
          ? spec.unitSellingPrice
          : pRow.selling_price;
      const costPrice = pRow.purchase_price; // Preserves historical transaction cost price!
      const lineTotal = sellPrice * spec.quantity;
      const lineCost = costPrice * spec.quantity;
      const lineProfit = lineTotal - lineCost;

      totalRevenue += lineTotal;
      totalCost += lineCost;

      preparedItems.push({
        productId: pRow.id,
        productName: pRow.name,
        sku: pRow.sku,
        unit: pRow.unit,
        quantity: spec.quantity,
        unitSellingPrice: sellPrice,
        unitCostPrice: costPrice,
        lineTotal,
        lineProfit,
        stockBefore: pRow.current_stock,
      });
    }

    const grossProfit = totalRevenue - totalCost;
    const receiptNo = `SM-${Date.now().toString().slice(-6)}`;
    const createdAt = input.createdAt
      ? new Date(input.createdAt).toISOString().slice(0, 19).replace('T', ' ')
      : new Date().toISOString().slice(0, 19).replace('T', ' ');

    const sRes = db
      .prepare(
        `INSERT INTO sales
         (business_id, user_id, client_tx_id, receipt_number, customer_name, payment_method, sale_type,
          total_revenue, total_cost, gross_profit, status, notes, is_demo_synthetic, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, 0, ?)`
      )
      .run(
        businessId,
        userId,
        clientTxId,
        receiptNo,
        input.customerName?.trim() || 'Walk-in Customer',
        input.paymentMethod,
        input.saleType ?? 'retail',
        totalRevenue,
        totalCost,
        grossProfit,
        (input.notes ?? '').trim(),
        createdAt
      );

    const saleId = Number(sRes.lastInsertRowid);

    const insItem = db.prepare(
      `INSERT INTO sale_items
       (sale_id, business_id, product_id, product_name, sku, unit, quantity,
        unit_selling_price, unit_cost_price, line_total, line_profit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const updInv = db.prepare(
      "UPDATE inventory SET current_stock = ?, updated_at = datetime('now') WHERE business_id = ? AND product_id = ?"
    );
    const insMove = db.prepare(
      `INSERT INTO stock_movements
       (business_id, product_id, movement_type, quantity_change, stock_before, stock_after, unit_cost, reference_id, note, is_demo_synthetic, created_at)
       VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?, 0, ?)`
    );

    for (const item of preparedItems) {
      const nextStock = item.stockBefore - item.quantity;
      insItem.run(
        saleId,
        businessId,
        item.productId,
        item.productName,
        item.sku,
        item.unit,
        item.quantity,
        item.unitSellingPrice,
        item.unitCostPrice,
        item.lineTotal,
        item.lineProfit
      );
      updInv.run(nextStock, businessId, item.productId);
      insMove.run(
        businessId,
        item.productId,
        -item.quantity,
        item.stockBefore,
        nextStock,
        item.unitCostPrice,
        receiptNo,
        `Sale ${receiptNo} (${input.customerName?.trim() || 'Walk-in'})`,
        createdAt
      );
    }

    db.exec('COMMIT');
    return { sale: getSaleById(db, businessId, saleId)!, duplicate: false };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function processReturnOrCancelTx(
  db: DatabaseSync,
  businessId: number,
  saleId: number,
  targetStatus: 'returned' | 'cancelled'
): Sale {
  db.exec('BEGIN');
  try {
    const saleRow = db
      .prepare('SELECT id, receipt_number, status FROM sales WHERE id = ? AND business_id = ?')
      .get(saleId, businessId) as
      | { id: number; receipt_number: string; status: string }
      | undefined;

    if (!saleRow) throw new Error('Sale transaction not found.');
    if (saleRow.status !== 'completed') {
      throw new Error(`Sale is already marked as ${saleRow.status}.`);
    }

    const items = db
      .prepare(
        'SELECT product_id, quantity, unit_cost_price FROM sale_items WHERE sale_id = ? AND business_id = ?'
      )
      .all(saleId, businessId) as Array<{
      product_id: number;
      quantity: number;
      unit_cost_price: number;
    }>;

    const getStock = db.prepare(
      'SELECT current_stock FROM inventory WHERE business_id = ? AND product_id = ?'
    );
    const updInv = db.prepare(
      "UPDATE inventory SET current_stock = ?, updated_at = datetime('now') WHERE business_id = ? AND product_id = ?"
    );
    const insMove = db.prepare(
      `INSERT INTO stock_movements
       (business_id, product_id, movement_type, quantity_change, stock_before, stock_after, unit_cost, reference_id, note)
       VALUES (?, ?, 'return', ?, ?, ?, ?, ?, ?)`
    );

    for (const item of items) {
      const inv = getStock.get(businessId, item.product_id) as { current_stock: number } | undefined;
      const before = inv?.current_stock ?? 0;
      const after = before + item.quantity;
      updInv.run(after, businessId, item.product_id);
      insMove.run(
        businessId,
        item.product_id,
        item.quantity,
        before,
        after,
        item.unit_cost_price,
        saleRow.receipt_number,
        `Stock restored (${targetStatus}) for ${saleRow.receipt_number}`
      );
    }

    db.prepare('UPDATE sales SET status = ? WHERE id = ? AND business_id = ?').run(
      targetStatus,
      saleId,
      businessId
    );

    db.exec('COMMIT');
    return getSaleById(db, businessId, saleId)!;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSaleById(
  db: DatabaseSync,
  businessId: number,
  saleId: number
): Sale | null {
  const row = db
    .prepare(
      `SELECT id, business_id, client_tx_id, receipt_number, customer_name, payment_method,
              sale_type, total_revenue, total_cost, gross_profit, status, notes,
              is_demo_synthetic, created_at
       FROM sales WHERE id = ? AND business_id = ?`
    )
    .get(saleId, businessId) as
    | {
        id: number;
        business_id: number;
        client_tx_id: string;
        receipt_number: string;
        customer_name: string;
        payment_method: PaymentMethod;
        sale_type: 'retail' | 'wholesale';
        total_revenue: number;
        total_cost: number;
        gross_profit: number;
        status: 'completed' | 'returned' | 'cancelled';
        notes: string;
        is_demo_synthetic: number;
        created_at: string;
      }
    | undefined;

  if (!row) return null;

  const items = db
    .prepare(
      `SELECT id, product_id, product_name, sku, unit, quantity, unit_selling_price,
              unit_cost_price, line_total, line_profit
       FROM sale_items WHERE sale_id = ? AND business_id = ?`
    )
    .all(saleId, businessId) as Array<{
    id: number;
    product_id: number;
    product_name: string;
    sku: string;
    unit: UnitType;
    quantity: number;
    unit_selling_price: number;
    unit_cost_price: number;
    line_total: number;
    line_profit: number;
  }>;

  return {
    id: row.id,
    businessId: row.business_id,
    clientTxId: row.client_tx_id,
    receiptNumber: row.receipt_number,
    customerName: row.customer_name,
    paymentMethod: row.payment_method,
    saleType: row.sale_type,
    totalRevenue: row.total_revenue,
    totalCost: row.total_cost,
    grossProfit: row.gross_profit,
    status: row.status,
    notes: row.notes,
    isDemoSynthetic: row.is_demo_synthetic === 1,
    createdAt: row.created_at,
    items: items.map((it) => ({
      id: it.id,
      productId: it.product_id,
      productName: it.product_name,
      sku: it.sku,
      unit: it.unit,
      quantity: it.quantity,
      unitSellingPrice: it.unit_selling_price,
      unitCostPrice: it.unit_cost_price,
      lineTotal: it.line_total,
      lineProfit: it.line_profit,
    })),
  };
}

export function listSales(
  db: DatabaseSync,
  businessId: number,
  options?: { fromDate?: string; toDate?: string; limit?: number }
): Sale[] {
  const conditions = ['business_id = ?'];
  const params: Array<string | number> = [businessId];

  if (options?.fromDate) {
    conditions.push('date(created_at) >= date(?)');
    params.push(options.fromDate);
  }
  if (options?.toDate) {
    conditions.push('date(created_at) <= date(?)');
    params.push(options.toDate);
  }
  const limit = options?.limit ?? 150;
  params.push(limit);

  const saleRows = db
    .prepare(
      `SELECT id FROM sales
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(...params) as Array<{ id: number }>;

  return saleRows
    .map((r) => getSaleById(db, businessId, r.id))
    .filter((s): s is Sale => s !== null);
}

export function getAllForecastsAndRestocking(
  db: DatabaseSync,
  businessId: number,
  referenceDate?: string
): {
  forecasts: ProductForecast[];
  recommendations: RestockingRecommendation[];
} {
  const products = listProducts(db, businessId, false);
  const today = referenceDate ?? new Date().toISOString().slice(0, 10);

  const dailyRows = db
    .prepare(
      `SELECT si.product_id, date(s.created_at) AS sale_date, SUM(si.quantity) AS qty
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE si.business_id = ? AND s.status = 'completed'
       GROUP BY si.product_id, date(s.created_at)
       ORDER BY sale_date ASC`
    )
    .all(businessId) as Array<{
    product_id: number;
    sale_date: string;
    qty: number;
  }>;

  const salesByProduct = new Map<number, DailySaleRecord[]>();
  for (const r of dailyRows) {
    const arr = salesByProduct.get(r.product_id) ?? [];
    arr.push({ date: r.sale_date, quantity: r.qty });
    salesByProduct.set(r.product_id, arr);
  }

  const forecasts: ProductForecast[] = [];
  const recommendations: RestockingRecommendation[] = [];

  const upsertForecast = db.prepare(
    `INSERT INTO forecasts (business_id, product_id, method, average_daily_demand, forecast_7d, forecast_30d, mae, insufficient_data, explanation, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(business_id, product_id) DO UPDATE SET
       method = excluded.method,
       average_daily_demand = excluded.average_daily_demand,
       forecast_7d = excluded.forecast_7d,
       forecast_30d = excluded.forecast_30d,
       mae = excluded.mae,
       insufficient_data = excluded.insufficient_data,
       explanation = excluded.explanation,
       computed_at = datetime('now')`
  );

  const upsertRestock = db.prepare(
    `INSERT INTO restocking_recommendations (business_id, product_id, reorder_point, status, recommended_order_qty, estimated_order_cost, reason, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(business_id, product_id) DO UPDATE SET
       reorder_point = excluded.reorder_point,
       status = excluded.status,
       recommended_order_qty = excluded.recommended_order_qty,
       estimated_order_cost = excluded.estimated_order_cost,
       reason = excluded.reason,
       computed_at = datetime('now')`
  );

  for (const prod of products) {
    const f = generateProductForecast({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      unit: prod.unit,
      currentStock: prod.currentStock,
      dailySales: salesByProduct.get(prod.id) ?? [],
      referenceDate: today,
    });

    const rec = computeRestockingRecommendation({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      categoryName: prod.categoryName,
      supplierName: prod.supplierName,
      unit: prod.unit,
      currentStock: prod.currentStock,
      minStockLevel: prod.minStockLevel,
      leadTimeDays: prod.leadTimeDays,
      safetyStock: prod.safetyStock,
      unitPurchasePrice: prod.purchasePrice,
      forecast: f,
    });

    forecasts.push(f);
    recommendations.push(rec);

    upsertForecast.run(
      businessId,
      prod.id,
      f.method,
      f.averageDailyDemand,
      f.forecast7d,
      f.forecast30d,
      f.mae,
      f.insufficientData ? 1 : 0,
      f.explanation
    );
    upsertRestock.run(
      businessId,
      prod.id,
      rec.reorderPoint,
      rec.status,
      rec.recommendedOrderQty,
      rec.estimatedOrderCost,
      rec.reason
    );
  }

  // Sort recommendations by urgency
  const rank: Record<string, number> = {
    'Restock immediately': 0,
    'Restock soon': 1,
    'Potential overstock': 2,
    'Product is moving slowly': 3,
    'Stock level is healthy': 4,
  };
  recommendations.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));

  return { forecasts, recommendations };
}

export function getDashboardSummary(
  db: DatabaseSync,
  businessId: number,
  fromDate?: string,
  toDate?: string
): DashboardSummary {
  const products = listProducts(db, businessId, false);
  const totalProducts = products.length;
  let totalStockValue = 0;
  let totalRetailValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const p of products) {
    totalStockValue += p.currentStock * p.purchasePrice;
    totalRetailValue += p.currentStock * p.sellingPrice;
    if (p.currentStock === 0) outOfStockCount++;
    else if (p.currentStock <= p.minStockLevel) lowStockCount++;
  }

  const dateFilter: string[] = ["business_id = ?", "status = 'completed'"];
  const params: Array<string | number> = [businessId];
  if (fromDate) {
    dateFilter.push('date(created_at) >= date(?)');
    params.push(fromDate);
  }
  if (toDate) {
    dateFilter.push('date(created_at) <= date(?)');
    params.push(toDate);
  }

  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(total_revenue), 0) AS rev,
              COALESCE(SUM(gross_profit), 0) AS prof,
              MAX(is_demo_synthetic) AS has_demo
       FROM sales
       WHERE ${dateFilter.join(' AND ')}`
    )
    .get(...params) as { rev: number; prof: number; has_demo: number | null };

  const todayISO = new Date().toISOString().slice(0, 10);
  const todayStats = db
    .prepare(
      `SELECT COALESCE(SUM(total_revenue), 0) AS rev,
              COALESCE(SUM(gross_profit), 0) AS prof,
              COUNT(*) AS cnt
       FROM sales
       WHERE business_id = ? AND status = 'completed' AND date(created_at) = date(?)`
    )
    .get(businessId, todayISO) as { rev: number; prof: number; cnt: number };

  const dailyRows = db
    .prepare(
      `SELECT date(created_at) AS d,
              SUM(total_revenue) AS rev,
              SUM(gross_profit) AS prof,
              COUNT(*) AS cnt
       FROM sales
       WHERE ${dateFilter.join(' AND ')}
       GROUP BY date(created_at)
       ORDER BY d ASC`
    )
    .all(...params) as Array<{ d: string; rev: number; prof: number; cnt: number }>;

  const weeklyRows = db
    .prepare(
      `SELECT strftime('%Y-W%W', created_at) AS period,
              SUM(total_revenue) AS rev,
              SUM(gross_profit) AS prof,
              COUNT(*) AS cnt
       FROM sales
       WHERE ${dateFilter.join(' AND ')}
       GROUP BY period
       ORDER BY period ASC`
    )
    .all(...params) as Array<{ period: string; rev: number; prof: number; cnt: number }>;

  const monthlyRows = db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS period,
              SUM(total_revenue) AS rev,
              SUM(gross_profit) AS prof,
              COUNT(*) AS cnt
       FROM sales
       WHERE ${dateFilter.join(' AND ')}
       GROUP BY period
       ORDER BY period ASC`
    )
    .all(...params) as Array<{ period: string; rev: number; prof: number; cnt: number }>;

  const itemConditions = ["s.business_id = ?", "s.status = 'completed'"];
  const itemParams: Array<string | number> = [businessId];
  if (fromDate) {
    itemConditions.push('date(s.created_at) >= date(?)');
    itemParams.push(fromDate);
  }
  if (toDate) {
    itemConditions.push('date(s.created_at) <= date(?)');
    itemParams.push(toDate);
  }

  const productSalesRows = db
    .prepare(
      `SELECT p.id AS product_id, p.name AS product_name,
              COALESCE(SUM(si.quantity), 0) AS units_sold,
              COALESCE(SUM(si.line_total), 0) AS revenue,
              COALESCE(SUM(si.line_profit), 0) AS profit,
              COALESCE(i.current_stock, 0) AS current_stock,
              COALESCE(i.current_stock, 0) * p.purchase_price AS stock_value
       FROM products p
       LEFT JOIN inventory i ON i.product_id = p.id
       LEFT JOIN sale_items si ON si.product_id = p.id
       LEFT JOIN sales s ON s.id = si.sale_id AND ${itemConditions.join(' AND ')}
       WHERE p.business_id = ? AND p.is_archived = 0
       GROUP BY p.id`
    )
    .all(...itemParams, businessId) as Array<{
    product_id: number;
    product_name: string;
    units_sold: number;
    revenue: number;
    profit: number;
    current_stock: number;
    stock_value: number;
  }>;

  const topSellingProducts = [...productSalesRows]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      unitsSold: r.units_sold,
      revenue: r.revenue,
      profit: r.profit,
    }));

  const slowMovingProducts = [...productSalesRows]
    .sort((a, b) => a.units_sold - b.units_sold)
    .slice(0, 5)
    .map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      unitsSold: r.units_sold,
      currentStock: r.current_stock,
      stockValue: r.stock_value,
    }));

  const { recommendations } = getAllForecastsAndRestocking(db, businessId);
  const urgentRestockCount = recommendations.filter(
    (r) => r.status === 'Restock immediately' || r.status === 'Restock soon'
  ).length;

  const grossMarginPct =
    totals.rev > 0 ? Number(((totals.prof / totals.rev) * 100).toFixed(1)) : 0;

  return {
    totalRevenue: totals.rev,
    estimatedGrossProfit: totals.prof,
    grossMarginPct,
    totalProducts,
    totalStockValue,
    totalRetailValue,
    lowStockCount,
    outOfStockCount,
    todaySalesRevenue: todayStats.rev,
    todaySalesCount: todayStats.cnt,
    todayGrossProfit: todayStats.prof,
    urgentRestockCount,
    hasSyntheticDemoData: (totals.has_demo ?? 0) === 1,
    dailyTrend: dailyRows.map((r) => ({
      date: r.d,
      revenue: r.rev,
      profit: r.prof,
      orders: r.cnt,
    })),
    weeklyTrend: weeklyRows.map((r) => ({
      period: r.period,
      revenue: r.rev,
      profit: r.prof,
      orders: r.cnt,
    })),
    monthlyTrend: monthlyRows.map((r) => ({
      period: r.period,
      revenue: r.rev,
      profit: r.prof,
      orders: r.cnt,
    })),
    topSellingProducts,
    slowMovingProducts,
  };
}
