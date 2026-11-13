import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, seedDemoBusinessIfEmpty } from './db.ts';
import {
  adjustStockTx,
  createProduct,
  deleteOrArchiveProduct,
  getAllForecastsAndRestocking,
  getProductById,
  getStockMovements,
  listProducts,
  listSales,
  loginUser,
  processReturnOrCancelTx,
  recordPurchaseTx,
  recordSaleTx,
  registerUserAndBusiness,
  updateProduct,
  verifyAuthToken,
} from './services.ts';
import {
  buildContiguousDailySeries,
  computeRestockingRecommendation,
  generateProductForecast,
} from './forecasting.ts';

test('Authentication: register, login, JWT verification, and invalid password rejection', () => {
  const db = createDatabase(':memory:');
  const reg = registerUserAndBusiness(db, {
    fullName: 'Adaeze Nwosu',
    email: 'adaeze@onitshamarket.ng',
    phone: '+2348030001111',
    password: 'StrongPassword123',
    businessName: 'Adaeze Electricals',
    marketLocation: 'Main Market, Onitsha',
  });

  assert.equal(reg.user.email, 'adaeze@onitshamarket.ng');
  assert.equal(reg.business.name, 'Adaeze Electricals');
  const decoded = verifyAuthToken(reg.token);
  assert.equal(decoded.businessId, reg.business.id);

  const logged = loginUser(db, 'adaeze@onitshamarket.ng', 'StrongPassword123');
  assert.equal(logged.user.id, reg.user.id);

  assert.throws(() => loginUser(db, 'adaeze@onitshamarket.ng', 'WrongPass'), /Invalid/);
});

test('Inventory & Sales: atomic stock deduction, historical cost profit preservation, return restoration, and negative inventory prevention', () => {
  const db = createDatabase(':memory:');
  const { business, user } = registerUserAndBusiness(db, {
    fullName: 'Emeka Obi',
    email: 'emeka@shop.ng',
    password: 'Password123',
    businessName: 'Emeka Phone Hub',
  });

  const prod = createProduct(db, business.id, {
    sku: 'TEST-001',
    name: '20W Fast Charger',
    categoryName: 'Chargers',
    unit: 'piece',
    purchasePrice: 3000,
    sellingPrice: 4500,
    initialStock: 10,
    minStockLevel: 3,
    leadTimeDays: 2,
    safetyStock: 2,
  });

  assert.equal(prod.currentStock, 10);

  // Record a sale of 4 units (cost = 3000, sell = 4500 => revenue 18000, profit 6000)
  const { sale, duplicate } = recordSaleTx(db, business.id, user.id, {
    clientTxId: 'offline-tx-1',
    customerName: 'Ngozi',
    paymentMethod: 'bank_transfer',
    items: [{ productId: prod.id, quantity: 4 }],
  });

  assert.equal(duplicate, false);
  assert.equal(sale.totalRevenue, 18000);
  assert.equal(sale.totalCost, 12000);
  assert.equal(sale.grossProfit, 6000);

  const afterSale = getProductById(db, business.id, prod.id)!;
  assert.equal(afterSale.currentStock, 6);

  // Duplicate transaction prevention (offline retry with same clientTxId)
  const retry = recordSaleTx(db, business.id, user.id, {
    clientTxId: 'offline-tx-1',
    customerName: 'Ngozi',
    paymentMethod: 'bank_transfer',
    items: [{ productId: prod.id, quantity: 4 }],
  });
  assert.equal(retry.duplicate, true);
  assert.equal(getProductById(db, business.id, prod.id)!.currentStock, 6);

  // Prevent accidental negative inventory
  assert.throws(
    () =>
      recordSaleTx(db, business.id, user.id, {
        clientTxId: 'tx-too-many',
        paymentMethod: 'cash',
        items: [{ productId: prod.id, quantity: 7 }],
      }),
    /Insufficient stock/
  );

  // Update product purchase cost later -> historical sale profit remains 6000!
  updateProduct(db, business.id, prod.id, { purchasePrice: 3800 });
  const historicalSales = listSales(db, business.id);
  assert.equal(historicalSales[0].grossProfit, 6000);
  assert.equal(historicalSales[0].items[0].unitCostPrice, 3000);

  // Process return -> stock restores atomically and stock movement recorded
  const returned = processReturnOrCancelTx(db, business.id, sale.id, 'returned');
  assert.equal(returned.status, 'returned');
  assert.equal(getProductById(db, business.id, prod.id)!.currentStock, 10);

  // Record purchase & manual adjustment
  recordPurchaseTx(db, business.id, user.id, {
    notes: 'Restock from Alaba',
    items: [{ productId: prod.id, quantity: 5, unitCost: 3500 }],
  });
  assert.equal(getProductById(db, business.id, prod.id)!.currentStock, 15);

  adjustStockTx(db, business.id, prod.id, -2, 'Damaged unit write-off');
  assert.equal(getProductById(db, business.id, prod.id)!.currentStock, 13);

  const movements = getStockMovements(db, business.id, prod.id);
  const types = movements.map((m) => m.movementType);
  assert.ok(types.includes('purchase'));
  assert.ok(types.includes('sale'));
  assert.ok(types.includes('return'));
  assert.ok(types.includes('adjustment'));

  // Archiving product that has sales preserves audit integrity
  const delRes = deleteOrArchiveProduct(db, business.id, prod.id);
  assert.equal(delRes.action, 'archived');
});

test('Business data isolation: Business B cannot access or sell Business A products', () => {
  const db = createDatabase(':memory:');
  const bizA = registerUserAndBusiness(db, {
    fullName: 'Owner A',
    email: 'a@market.ng',
    password: 'Password123',
    businessName: 'Shop A',
  });
  const bizB = registerUserAndBusiness(db, {
    fullName: 'Owner B',
    email: 'b@market.ng',
    password: 'Password123',
    businessName: 'Shop B',
  });

  const prodA = createProduct(db, bizA.business.id, {
    sku: 'A-1',
    name: 'Shop A Cable',
    unit: 'piece',
    purchasePrice: 500,
    sellingPrice: 1000,
    initialStock: 20,
    minStockLevel: 5,
    leadTimeDays: 2,
    safetyStock: 5,
  });

  assert.equal(listProducts(db, bizB.business.id).length, 0);
  assert.equal(getProductById(db, bizB.business.id, prodA.id), null);
  assert.throws(
    () =>
      recordSaleTx(db, bizB.business.id, bizB.user.id, {
        paymentMethod: 'cash',
        items: [{ productId: prodA.id, quantity: 1 }],
      }),
    /does not belong to this business/
  );
});

test('Forecasting engine: fills missing dates with zero, evaluates MAE, detects seasonality, and handles insufficient data transparently', () => {
  // 1. Missing dates filled with zero
  const contiguous = buildContiguousDailySeries(
    [
      { date: '2026-10-01', quantity: 5 },
      { date: '2026-10-03', quantity: 3 },
    ],
    '2026-10-04',
    4
  );
  assert.deepEqual(
    contiguous.map((p) => p.quantity),
    [5, 0, 3, 0]
  );

  // 2. Insufficient data fallback
  const sparseForecast = generateProductForecast({
    productId: 1,
    productName: 'New Car Charger',
    sku: 'NEW-1',
    unit: 'piece',
    currentStock: 10,
    dailySales: [{ date: '2026-11-11', quantity: 2 }],
    referenceDate: '2026-11-12',
  });
  assert.equal(sparseForecast.insufficientData, true);
  assert.equal(sparseForecast.confidenceLabel, 'Low');
  assert.ok(sparseForecast.explanation.includes('fallback'));

  // 3. Full 35-day history with higher Mondays/Saturdays -> computes MAE and positive forecasts
  const dailySales: Array<{ date: string; quantity: number }> = [];
  for (let i = 34; i >= 0; i--) {
    const dt = new Date(Date.UTC(2026, 10, 12 - i));
    const dow = dt.getUTCDay();
    const qty = dow === 1 || dow === 6 ? 8 : dow === 0 ? 1 : 4;
    dailySales.push({ date: dt.toISOString().slice(0, 10), quantity: qty });
  }
  const fullForecast = generateProductForecast({
    productId: 2,
    productName: 'Type-C Cable',
    sku: 'CBL-2',
    unit: 'piece',
    currentStock: 15,
    dailySales,
    referenceDate: '2026-11-12',
  });

  assert.equal(fullForecast.insufficientData, false);
  assert.equal(fullForecast.confidenceLabel, 'High');
  assert.ok(fullForecast.mae !== null && fullForecast.mae >= 0);
  assert.ok(fullForecast.forecast7d > 15);
  assert.ok(fullForecast.forecast30d > fullForecast.forecast7d * 3);
  assert.ok(fullForecast.peakDays.includes('Mon') || fullForecast.peakDays.includes('Sat'));
});

test('Restocking engine: calculates Reorder Point = Avg Daily Demand * Lead Time + Safety Stock with accurate status', () => {
  const forecast = generateProductForecast({
    productId: 1,
    productName: 'USB Charger',
    sku: 'CHG-1',
    unit: 'piece',
    currentStock: 10,
    dailySales: Array.from({ length: 28 }, (_, idx) => {
      const dt = new Date(Date.UTC(2026, 10, 12 - idx));
      return { date: dt.toISOString().slice(0, 10), quantity: 4 };
    }),
    referenceDate: '2026-11-12',
  });

  // avgDailyDemand = 4, leadTimeDays = 3, safetyStock = 5 => reorderPoint = ceil(4*3 + 5) = 17
  const rec = computeRestockingRecommendation({
    productId: 1,
    productName: 'USB Charger',
    sku: 'CHG-1',
    categoryName: 'Chargers',
    supplierName: 'Alaba Depot',
    unit: 'piece',
    currentStock: 10,
    minStockLevel: 8,
    leadTimeDays: 3,
    safetyStock: 5,
    unitPurchasePrice: 3000,
    forecast,
  });

  assert.equal(rec.reorderPoint, 17);
  assert.equal(rec.status, 'Restock immediately');
  assert.ok(rec.recommendedOrderQty > 0);
  assert.ok(rec.reason.includes('reorder point of 17'));
});

test('Demo seed: creates Onitsha demo account with synthetic sales and computed forecasts', () => {
  const db = createDatabase(':memory:');
  seedDemoBusinessIfEmpty(db);
  const demoLogin = loginUser(db, 'demo@smartmarket.ng', 'DemoTrader2026!');
  assert.equal(demoLogin.business.isDemo, true);

  const products = listProducts(db, demoLogin.business.id, false);
  assert.equal(products.length, 10);

  const { forecasts, recommendations } = getAllForecastsAndRestocking(
    db,
    demoLogin.business.id
  );
  assert.equal(forecasts.length, 10);
  assert.equal(recommendations.length, 10);
  assert.ok(recommendations.some((r) => r.status === 'Restock immediately'));
});
