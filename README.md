# Smart Market — Inventory Management & Sales Forecasting System

Built for wholesale and retail traders in **Onitsha, Anambra State, Nigeria**. Smart Market replaces paper notebooks with atomic stock accounting, historical-cost gross profit tracking, statistical demand forecasting, explainable restocking intelligence, and offline-first POS sales.

## Key Capabilities

- **Demo Account Ready**: One-click **Enter Demo Shop** (`demo@smartmarket.ng` / `DemoTrader2026!`) preloaded with Chinedu Electronics & Phone Accessories (10 products, 45 days of clearly labeled synthetic Onitsha transaction history).
- **Inventory Management**: Product CRUD, categories, suppliers, flexible units (`piece`, `pack`, `dozen`, `carton`), purchase restocking, manual stock adjustments, negative-inventory prevention, and full stock movement audit trails.
- **POS & Sales Tracking**: Multi-product cart, retail/wholesale order types, Nigerian Naira (`₦`) formatting, Cash / Bank Transfer / POS / Credit payment tracking, historical purchase-cost profit calculation, printable receipts, and stock-restoring returns.
- **Statistical Demand Forecasting Engine (`server/forecasting.ts`)**:
  - Aggregates historical sales by day, filling missing dates and zero-sales days with `0`.
  - Blends Single Exponential Smoothing ($\alpha = 0.30$), 14-day Weighted Moving Average, 7-day Simple Moving Average, and Day-of-Week Seasonality (when $\ge 21$ days of history exist).
  - Evaluates walk-forward **Mean Absolute Error (MAE)** and **WAPE**, displays 80% statistical uncertainty intervals, and transparently falls back to an observed-mean baseline when historical data is insufficient (`< 7` days or `< 3` active sale days).
- **Explainable Restocking Intelligence**:
  - Applies `Reorder Point = Average Daily Demand × Supplier Lead Time + Safety Stock`.
  - Categorizes products (`Restock immediately`, `Restock soon`, `Stock level is healthy`, `Product is moving slowly`, `Potential overstock`) with clear explanations and practical order quantities.
- **Offline-First PWA**:
  - Service Worker + Web App Manifest (`vite-plugin-pwa`) + IndexedDB caching & `pending_sales` queue.
  - Idempotent server synchronization (`client_tx_id`) prevents duplicate sales on retry.
  - Includes a built-in **Simulate Offline Mode** toggle in Settings for testing offline queues.
- **Local Market Adaptation**: Simple English and Igbo (`EN | IG`) interface toggle, Nigerian Naira (`₦`) formatting, and mobile-first responsive layout.

## Database Schema

Normalized relational schema in `server/db.ts`:
`users`, `businesses`, `business_memberships`, `product_categories`, `suppliers`, `products`, `inventory`, `sales`, `sale_items`, `purchases`, `purchase_items`, `stock_movements`, `forecasts`, `restocking_recommendations`.

## Running & Testing

```bash
npm install
npm test        # Runs unit tests in server/core.test.ts
npm run lint    # TypeScript type-checking
npm run build   # Builds frontend production bundle to dist/
npm run dev     # Starts Express + Vite dev server on port 3000
npm start       # Starts production server on port 3000 (Node 22+)
```

## Hackathon Demo Script

1. **Login**: Click **Enter Demo Shop** on the sign-in screen to open Chinedu Electronics (Onitsha).
2. **Dashboard**: Review Total Revenue, Estimated Gross Profit, Stock Valuation, and Urgent Restock Alerts.
3. **Forecasting**: Open **Forecasting**, inspect *Braided USB-C Cable* (seasonal peak days, MAE, 7d/30d outlook), and switch to *45W Dual-Port Car Charger* to show the transparent insufficient-data fallback.
4. **Restocking**: Open **Restocking**, see *Reorder Point* math and explanations, adjust Lead Time, and click **Record Restock**.
5. **Offline POS & Sync**: Go to **Settings**, enable **Simulate Offline Mode**, navigate to **Sales & POS**, complete a sale (queued in IndexedDB), then re-enable Online Mode and watch automatic deduplicated sync complete.
