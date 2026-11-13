export type UnitType = 'piece' | 'pack' | 'dozen' | 'carton';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'pos' | 'credit';

export type RestockStatus =
  | 'Restock immediately'
  | 'Restock soon'
  | 'Stock level is healthy'
  | 'Product is moving slowly'
  | 'Potential overstock';

export interface User {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  role: string;
}

export interface Business {
  id: number;
  name: string;
  marketLocation: string;
  city: string;
  state: string;
  currency: string;
  preferredLanguage: 'en' | 'ig';
  isDemo: boolean;
}

export interface Category {
  id: number;
  businessId: number;
  name: string;
}

export interface Supplier {
  id: number;
  businessId: number;
  name: string;
  phone: string;
  marketLocation: string;
  defaultLeadTimeDays: number;
}

export interface Product {
  id: number;
  businessId: number;
  categoryId: number | null;
  categoryName: string;
  supplierId: number | null;
  supplierName: string;
  sku: string;
  name: string;
  unit: UnitType;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  minStockLevel: number;
  leadTimeDays: number;
  safetyStock: number;
  isArchived: boolean;
  updatedAt: string;
}

export interface StockMovement {
  id: number;
  businessId: number;
  productId: number;
  productName: string;
  movementType: 'purchase' | 'sale' | 'return' | 'adjustment';
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  unitCost: number;
  referenceId: string | null;
  note: string;
  isDemoSynthetic: boolean;
  createdAt: string;
}

export interface SaleItem {
  id?: number;
  productId: number;
  productName: string;
  sku: string;
  unit: UnitType;
  quantity: number;
  unitSellingPrice: number;
  unitCostPrice: number;
  lineTotal: number;
  lineProfit: number;
}

export interface Sale {
  id: number;
  businessId: number;
  clientTxId: string;
  receiptNumber: string;
  customerName: string;
  paymentMethod: PaymentMethod;
  saleType: 'retail' | 'wholesale';
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  status: 'completed' | 'returned' | 'cancelled';
  notes: string;
  isDemoSynthetic: boolean;
  createdAt: string;
  items: SaleItem[];
}

export interface DailySeriesPoint {
  date: string;
  actual: number | null;
  predicted: number | null;
  lower: number | null;
  upper: number | null;
}

export interface ProductForecast {
  productId: number;
  productName: string;
  sku: string;
  unit: UnitType;
  currentStock: number;
  method: string;
  insufficientData: boolean;
  confidenceLabel: 'High' | 'Medium' | 'Low';
  historyDays: number;
  nonZeroDays: number;
  averageDailyDemand: number;
  forecast7d: number;
  forecast7dLower: number;
  forecast7dUpper: number;
  forecast30d: number;
  forecast30dLower: number;
  forecast30dUpper: number;
  mae: number | null;
  wape: number | null;
  peakDays: string[];
  explanation: string;
  series: DailySeriesPoint[];
}

export interface RestockingRecommendation {
  productId: number;
  productName: string;
  sku: string;
  categoryName: string;
  supplierName: string;
  unit: UnitType;
  currentStock: number;
  averageDailyDemand: number;
  forecast7d: number;
  forecast30d: number;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  daysOfCover: number;
  status: RestockStatus;
  recommendedOrderQty: number;
  estimatedOrderCost: number;
  unitPurchasePrice: number;
  reason: string;
  insufficientData: boolean;
}

export interface DashboardSummary {
  totalRevenue: number;
  estimatedGrossProfit: number;
  grossMarginPct: number;
  totalProducts: number;
  totalStockValue: number;
  totalRetailValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  todaySalesRevenue: number;
  todaySalesCount: number;
  todayGrossProfit: number;
  urgentRestockCount: number;
  hasSyntheticDemoData: boolean;
  dailyTrend: Array<{ date: string; revenue: number; profit: number; orders: number }>;
  weeklyTrend: Array<{ period: string; revenue: number; profit: number; orders: number }>;
  monthlyTrend: Array<{ period: string; revenue: number; profit: number; orders: number }>;
  topSellingProducts: Array<{
    productId: number;
    productName: string;
    unitsSold: number;
    revenue: number;
    profit: number;
  }>;
  slowMovingProducts: Array<{
    productId: number;
    productName: string;
    unitsSold: number;
    currentStock: number;
    stockValue: number;
  }>;
}

export interface OfflinePendingSale {
  clientTxId: string;
  businessId: number;
  customerName: string;
  paymentMethod: PaymentMethod;
  saleType: 'retail' | 'wholesale';
  notes: string;
  createdAt: string;
  items: Array<{
    productId: number;
    productName: string;
    sku: string;
    unit: UnitType;
    quantity: number;
    unitSellingPrice: number;
    unitCostPrice: number;
  }>;
  totalRevenue: number;
  syncStatus: 'pending' | 'syncing' | 'failed';
  lastError?: string;
}
