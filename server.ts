import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, seedDemoBusinessIfEmpty } from './server/db.ts';
import {
  adjustStockTx,
  createProduct,
  deleteOrArchiveProduct,
  getAllForecastsAndRestocking,
  getBusinessById,
  getDashboardSummary,
  getStockMovements,
  listCategories,
  listProducts,
  listSales,
  listSuppliers,
  loginUser,
  processReturnOrCancelTx,
  recordPurchaseTx,
  recordSaleTx,
  registerUserAndBusiness,
  updateBusinessProfile,
  updateProduct,
  verifyAuthToken,
  type AuthTokenPayload,
  type CreateSaleInput,
} from './server/services.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuthedRequest extends Request {
  auth?: AuthTokenPayload;
}

const db = createDatabase();
seedDemoBusinessIfEmpty(db);

const app = express();
app.use(express.json({ limit: '2mb' }));

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    req.auth = verifyAuthToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid token.' });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { fullName, email, phone, password, businessName, marketLocation } = req.body ?? {};
    if (!fullName || !email || !password || !businessName) {
      res.status(400).json({ error: 'Full name, email, password, and business name are required.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    const result = registerUserAndBusiness(db, {
      fullName: String(fullName),
      email: String(email),
      phone: phone ? String(phone) : '',
      password: String(password),
      businessName: String(businessName),
      marketLocation: marketLocation ? String(marketLocation) : undefined,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const result = loginUser(db, String(email), String(password));
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Login failed.' });
  }
});

app.post('/api/auth/demo', (_req, res) => {
  try {
    seedDemoBusinessIfEmpty(db);
    const result = loginUser(db, 'demo@smartmarket.ng', 'DemoTrader2026!');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Demo login unavailable.' });
  }
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const auth = req.auth!;
  const business = getBusinessById(db, auth.businessId);
  const userRow = db
    .prepare('SELECT id, full_name, email, phone FROM users WHERE id = ?')
    .get(auth.userId) as
    | { id: number; full_name: string; email: string; phone: string }
    | undefined;
  if (!business || !userRow) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }
  res.json({
    user: {
      id: userRow.id,
      fullName: userRow.full_name,
      email: userRow.email,
      phone: userRow.phone,
      role: auth.role,
    },
    business,
  });
});

app.patch('/api/business', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { name, marketLocation, preferredLanguage } = req.body ?? {};
    const business = updateBusinessProfile(db, req.auth!.businessId, {
      name,
      marketLocation,
      preferredLanguage,
    });
    res.json({ business });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed.' });
  }
});

app.get('/api/dashboard', requireAuth, (req: AuthedRequest, res) => {
  try {
    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;
    const summary = getDashboardSummary(db, req.auth!.businessId, fromDate, toDate);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load dashboard.' });
  }
});

app.get('/api/categories', requireAuth, (req: AuthedRequest, res) => {
  res.json({ categories: listCategories(db, req.auth!.businessId) });
});

app.get('/api/suppliers', requireAuth, (req: AuthedRequest, res) => {
  res.json({ suppliers: listSuppliers(db, req.auth!.businessId) });
});

app.get('/api/products', requireAuth, (req: AuthedRequest, res) => {
  const includeArchived = req.query.includeArchived !== 'false';
  res.json({ products: listProducts(db, req.auth!.businessId, includeArchived) });
});

app.post('/api/products', requireAuth, (req: AuthedRequest, res) => {
  try {
    const body = req.body ?? {};
    const product = createProduct(db, req.auth!.businessId, {
      sku: String(body.sku ?? ''),
      name: String(body.name ?? ''),
      categoryId: body.categoryId ? Number(body.categoryId) : null,
      categoryName: body.categoryName ? String(body.categoryName) : undefined,
      supplierId: body.supplierId ? Number(body.supplierId) : null,
      unit: body.unit ?? 'piece',
      purchasePrice: Number(body.purchasePrice ?? 0),
      sellingPrice: Number(body.sellingPrice ?? 0),
      initialStock: Number(body.initialStock ?? 0),
      minStockLevel: Number(body.minStockLevel ?? 5),
      leadTimeDays: Number(body.leadTimeDays ?? 3),
      safetyStock: Number(body.safetyStock ?? 5),
    });
    res.status(201).json({ product });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create product.' });
  }
});

app.patch('/api/products/:id', requireAuth, (req: AuthedRequest, res) => {
  try {
    const productId = Number(req.params.id);
    const body = req.body ?? {};
    const product = updateProduct(db, req.auth!.businessId, productId, {
      sku: body.sku !== undefined ? String(body.sku) : undefined,
      name: body.name !== undefined ? String(body.name) : undefined,
      categoryId: body.categoryId !== undefined ? (body.categoryId ? Number(body.categoryId) : null) : undefined,
      categoryName: body.categoryName !== undefined ? String(body.categoryName) : undefined,
      supplierId: body.supplierId !== undefined ? (body.supplierId ? Number(body.supplierId) : null) : undefined,
      unit: body.unit,
      purchasePrice: body.purchasePrice !== undefined ? Number(body.purchasePrice) : undefined,
      sellingPrice: body.sellingPrice !== undefined ? Number(body.sellingPrice) : undefined,
      minStockLevel: body.minStockLevel !== undefined ? Number(body.minStockLevel) : undefined,
      leadTimeDays: body.leadTimeDays !== undefined ? Number(body.leadTimeDays) : undefined,
      safetyStock: body.safetyStock !== undefined ? Number(body.safetyStock) : undefined,
      isArchived: body.isArchived !== undefined ? Boolean(body.isArchived) : undefined,
    });
    res.json({ product });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update product.' });
  }
});

app.delete('/api/products/:id', requireAuth, (req: AuthedRequest, res) => {
  try {
    const productId = Number(req.params.id);
    const result = deleteOrArchiveProduct(db, req.auth!.businessId, productId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete product.' });
  }
});

app.post('/api/products/:id/adjust', requireAuth, (req: AuthedRequest, res) => {
  try {
    const productId = Number(req.params.id);
    const { quantityChange, note } = req.body ?? {};
    const product = adjustStockTx(
      db,
      req.auth!.businessId,
      productId,
      Number(quantityChange),
      String(note ?? '')
    );
    res.json({ product });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Stock adjustment failed.' });
  }
});

app.get('/api/stock-movements', requireAuth, (req: AuthedRequest, res) => {
  const productId = req.query.productId ? Number(req.query.productId) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json({ movements: getStockMovements(db, req.auth!.businessId, productId, limit) });
});

app.post('/api/purchases', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { supplierId, notes, items } = req.body ?? {};
    const result = recordPurchaseTx(db, req.auth!.businessId, req.auth!.userId, {
      supplierId: supplierId ? Number(supplierId) : null,
      notes: notes ? String(notes) : '',
      items: Array.isArray(items)
        ? items.map((it: { productId: number; quantity: number; unitCost?: number }) => ({
            productId: Number(it.productId),
            quantity: Number(it.quantity),
            unitCost: it.unitCost !== undefined ? Number(it.unitCost) : undefined,
          }))
        : [],
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record purchase.' });
  }
});

app.get('/api/sales', requireAuth, (req: AuthedRequest, res) => {
  const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
  const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;
  res.json({ sales: listSales(db, req.auth!.businessId, { fromDate, toDate }) });
});

app.post('/api/sales', requireAuth, (req: AuthedRequest, res) => {
  try {
    const body = req.body as CreateSaleInput;
    const result = recordSaleTx(db, req.auth!.businessId, req.auth!.userId, body);
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record sale.' });
  }
});

app.post('/api/sales/sync', requireAuth, (req: AuthedRequest, res) => {
  const batch = Array.isArray(req.body?.sales) ? (req.body.sales as CreateSaleInput[]) : [];
  const results = batch.map((tx) => {
    const clientTxId = tx.clientTxId ?? '';
    try {
      const { sale, duplicate } = recordSaleTx(
        db,
        req.auth!.businessId,
        req.auth!.userId,
        tx
      );
      return {
        clientTxId,
        status: duplicate ? 'duplicate' : 'synced',
        sale,
      };
    } catch (err) {
      return {
        clientTxId,
        status: 'error',
        error: err instanceof Error ? err.message : 'Sync conflict',
      };
    }
  });
  res.json({ results });
});

app.post('/api/sales/:id/return', requireAuth, (req: AuthedRequest, res) => {
  try {
    const saleId = Number(req.params.id);
    const status = req.body?.status === 'cancelled' ? 'cancelled' : 'returned';
    const sale = processReturnOrCancelTx(db, req.auth!.businessId, saleId, status);
    res.json({ sale });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to process return.' });
  }
});

app.get('/api/forecasting', requireAuth, (req: AuthedRequest, res) => {
  try {
    const data = getAllForecastsAndRestocking(db, req.auth!.businessId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Forecasting failed.' });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT ?? 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Market server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
