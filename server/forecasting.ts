import type {
  DailySeriesPoint,
  ProductForecast,
  RestockingRecommendation,
  RestockStatus,
  UnitType,
} from '../src/types/index.ts';

export interface DailySaleRecord {
  date: string; // YYYY-MM-DD
  quantity: number;
}

export interface ForecastInput {
  productId: number;
  productName: string;
  sku: string;
  unit: UnitType;
  currentStock: number;
  dailySales: DailySaleRecord[];
  referenceDate?: string; // YYYY-MM-DD
  lookbackDays?: number;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function addDaysISO(dateStr: string, offsetDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

export function getDayOfWeekUTC(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Builds a contiguous daily time series filling missing dates with 0.
 */
export function buildContiguousDailySeries(
  records: DailySaleRecord[],
  endDate: string,
  lookbackDays = 60
): Array<{ date: string; quantity: number }> {
  const map = new Map<string, number>();
  for (const r of records) {
    const key = r.date.slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + Math.max(0, r.quantity));
  }

  const startDate = addDaysISO(endDate, -(lookbackDays - 1));
  const series: Array<{ date: string; quantity: number }> = [];
  for (let i = 0; i < lookbackDays; i++) {
    const d = addDaysISO(startDate, i);
    series.push({ date: d, quantity: map.get(d) ?? 0 });
  }
  return series;
}

export function simpleMovingAverage(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function weightedMovingAverage(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < slice.length; i++) {
    const w = i + 1;
    weightedSum += slice[i] * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

export function singleExponentialSmoothing(values: number[], alpha = 0.3): number {
  if (values.length === 0) return 0;
  let level = values[0];
  for (let i = 1; i < values.length; i++) {
    level = alpha * values[i] + (1 - alpha) * level;
  }
  return level;
}

export function computeSeasonalIndices(
  series: Array<{ date: string; quantity: number }>
): number[] {
  const sums = new Array<number>(7).fill(0);
  const counts = new Array<number>(7).fill(0);
  let total = 0;
  for (const pt of series) {
    const dow = getDayOfWeekUTC(pt.date);
    sums[dow] += pt.quantity;
    counts[dow] += 1;
    total += pt.quantity;
  }
  const overallMean = series.length > 0 ? total / series.length : 0;
  if (overallMean <= 0.01) {
    return new Array<number>(7).fill(1);
  }
  const raw = sums.map((s, idx) => {
    const avg = counts[idx] > 0 ? s / counts[idx] : overallMean;
    const ratio = avg / overallMean;
    return Math.min(1.8, Math.max(0.5, ratio));
  });
  const meanIdx = raw.reduce((a, b) => a + b, 0) / 7;
  return raw.map((r) => r / (meanIdx || 1));
}

function predictNextDayLevel(
  historySlice: Array<{ date: string; quantity: number }>,
  targetDate: string,
  useSeasonality: boolean
): number {
  const vals = historySlice.map((p) => p.quantity);
  if (vals.length === 0) return 0;
  const ses = singleExponentialSmoothing(vals, 0.3);
  const sma7 = simpleMovingAverage(vals, 7);
  const wma14 = weightedMovingAverage(vals, 14);

  const base =
    vals.length >= 21
      ? 0.45 * ses + 0.35 * wma14 + 0.2 * sma7
      : 0.5 * ses + 0.5 * sma7;

  if (!useSeasonality || vals.length < 21) {
    return Math.max(0, base);
  }

  const indices = computeSeasonalIndices(historySlice);
  const dow = getDayOfWeekUTC(targetDate);
  return Math.max(0, base * indices[dow]);
}

export function generateProductForecast(input: ForecastInput): ProductForecast {
  const today = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const lookbackDays = input.lookbackDays ?? 60;
  const fullSeries = buildContiguousDailySeries(input.dailySales, today, lookbackDays);

  // Determine effective active history window starting from first recorded sale (or min 14 days)
  const firstSaleIdx = fullSeries.findIndex((p) => p.quantity > 0);
  const activeSeries =
    firstSaleIdx === -1 ? [] : fullSeries.slice(firstSaleIdx);

  const historyDays = activeSeries.length;
  const nonZeroDays = activeSeries.filter((p) => p.quantity > 0).length;
  const insufficientData = historyDays < 7 || nonZeroDays < 3;

  // Walk-forward backtest for MAE & residual std error
  const backtestPreds = new Map<string, number>();
  const absErrors: number[] = [];
  const signedErrors: number[] = [];
  let sumActualBacktest = 0;

  if (!insufficientData && activeSeries.length >= 8) {
    const startIdx = Math.max(7, activeSeries.length - 21);
    for (let i = startIdx; i < activeSeries.length; i++) {
      const subHistory = activeSeries.slice(0, i);
      const target = activeSeries[i];
      const useSeason = subHistory.length >= 21 && nonZeroDays >= 5;
      const pred = predictNextDayLevel(subHistory, target.date, useSeason);
      backtestPreds.set(target.date, Number(pred.toFixed(2)));
      const err = target.quantity - pred;
      signedErrors.push(err);
      absErrors.push(Math.abs(err));
      sumActualBacktest += target.quantity;
    }
  }

  const mae =
    absErrors.length > 0
      ? Number((absErrors.reduce((a, b) => a + b, 0) / absErrors.length).toFixed(2))
      : null;

  const wape =
    absErrors.length > 0 && sumActualBacktest > 0
      ? Number(
          ((absErrors.reduce((a, b) => a + b, 0) / sumActualBacktest) * 100).toFixed(1)
        )
      : null;

  // Residual standard deviation for uncertainty cone
  let sigma = 0.5;
  if (signedErrors.length >= 3) {
    const variance =
      signedErrors.reduce((acc, e) => acc + e * e, 0) / (signedErrors.length - 1);
    sigma = Math.max(0.25, Math.sqrt(variance));
  } else if (activeSeries.length > 0) {
    const meanQ = activeSeries.reduce((a, b) => a + b.quantity, 0) / activeSeries.length;
    sigma = Math.max(0.35, meanQ * 0.45);
  }

  // Compute future 30-day daily predictions
  const useSeasonality = historyDays >= 21 && nonZeroDays >= 5;
  const seasonalIndices = useSeasonality
    ? computeSeasonalIndices(activeSeries)
    : new Array<number>(7).fill(1);

  let baseDailyDemand = 0;
  let method = 'Transparent Baseline Fallback';
  let confidenceLabel: 'High' | 'Medium' | 'Low' = 'Low';

  if (insufficientData) {
    if (activeSeries.length > 0) {
      const totalUnits = activeSeries.reduce((a, b) => a + b.quantity, 0);
      baseDailyDemand = totalUnits / Math.max(activeSeries.length, 7);
    } else {
      baseDailyDemand = 0;
    }
    method =
      historyDays === 0
        ? 'No Sales History Fallback (0 baseline)'
        : 'Insufficient History Baseline (Observed Mean)';
    confidenceLabel = 'Low';
  } else {
    const vals = activeSeries.map((p) => p.quantity);
    const ses = singleExponentialSmoothing(vals, 0.3);
    const sma7 = simpleMovingAverage(vals, 7);
    const wma14 = weightedMovingAverage(vals, 14);
    if (useSeasonality) {
      baseDailyDemand = 0.45 * ses + 0.35 * wma14 + 0.2 * sma7;
      method = 'Exponential Smoothing + Weighted MA + Day-of-Week Seasonality';
      confidenceLabel = nonZeroDays >= 12 ? 'High' : 'Medium';
    } else {
      baseDailyDemand = 0.5 * ses + 0.5 * sma7;
      method = 'Exponential Smoothing + 7-Day Moving Average';
      confidenceLabel = 'Medium';
    }
  }

  baseDailyDemand = Math.max(0, Number(baseDailyDemand.toFixed(2)));

  // Identify peak days if seasonality is active
  const peakDays: string[] = [];
  if (useSeasonality) {
    seasonalIndices.forEach((idxVal, dow) => {
      if (idxVal >= 1.12) peakDays.push(DAY_NAMES[dow]);
    });
  }

  // Build future 30 daily points
  const futurePoints: DailySeriesPoint[] = [];
  let sum7 = 0;
  let sum30 = 0;

  for (let h = 1; h <= 30; h++) {
    const fDate = addDaysISO(today, h);
    const dow = getDayOfWeekUTC(fDate);
    const dayPred = Math.max(0, baseDailyDemand * seasonalIndices[dow]);
    const margin = 1.28 * sigma * Math.sqrt(1 + h * 0.04);
    const lower = Math.max(0, dayPred - margin);
    const upper = dayPred + margin;

    if (h <= 7) sum7 += dayPred;
    sum30 += dayPred;

    futurePoints.push({
      date: fDate,
      actual: null,
      predicted: Number(dayPred.toFixed(2)),
      lower: Number(lower.toFixed(2)),
      upper: Number(upper.toFixed(2)),
    });
  }

  const forecast7d = Number(sum7.toFixed(1));
  const forecast30d = Number(sum30.toFixed(1));
  const margin7 = 1.28 * sigma * Math.sqrt(7);
  const margin30 = 1.28 * sigma * Math.sqrt(30);

  // Build chart series: last 30 historical days + next 14 future days
  const recentHistory = fullSeries.slice(-30);
  const historyChartPoints: DailySeriesPoint[] = recentHistory.map((pt) => ({
    date: pt.date,
    actual: pt.quantity,
    predicted: backtestPreds.get(pt.date) ?? null,
    lower: null,
    upper: null,
  }));

  const chartSeries = [...historyChartPoints, ...futurePoints.slice(0, 14)];

  let explanation = '';
  if (historyDays === 0) {
    explanation =
      'No completed sales recorded yet for this product. Forecast defaults to 0 units/day until real transactions are logged.';
  } else if (insufficientData) {
    explanation = `Only ${nonZeroDays} sale day(s) observed over ${historyDays} day(s). Using a conservative observed-mean fallback (${baseDailyDemand.toFixed(2)} ${input.unit}/day). Accuracy improves automatically once 7+ days of sales are recorded.`;
  } else if (useSeasonality) {
    const peakText =
      peakDays.length > 0
        ? ` Demand peaks on ${peakDays.join(', ')}.`
        : ' Daily demand is relatively steady across the week.';
    explanation = `Calculated from ${nonZeroDays} active sales days over a ${historyDays}-day window using Exponential Smoothing (α=0.30), 14-day Weighted Moving Average, and Day-of-Week Seasonality.${peakText} Backtest MAE is ${mae ?? 'N/A'} ${input.unit}/day.`;
  } else {
    explanation = `Calculated from ${nonZeroDays} active sales days over a ${historyDays}-day window using Exponential Smoothing (α=0.30) and 7-Day Moving Average. Collect 21+ days of history to unlock Onitsha weekly seasonality.`;
  }

  return {
    productId: input.productId,
    productName: input.productName,
    sku: input.sku,
    unit: input.unit,
    currentStock: input.currentStock,
    method,
    insufficientData,
    confidenceLabel,
    historyDays,
    nonZeroDays,
    averageDailyDemand: baseDailyDemand,
    forecast7d,
    forecast7dLower: Math.max(0, Number((forecast7d - margin7).toFixed(1))),
    forecast7dUpper: Number((forecast7d + margin7).toFixed(1)),
    forecast30d,
    forecast30dLower: Math.max(0, Number((forecast30d - margin30).toFixed(1))),
    forecast30dUpper: Number((forecast30d + margin30).toFixed(1)),
    mae,
    wape,
    peakDays,
    explanation,
    series: chartSeries,
  };
}

export interface RestockInput {
  productId: number;
  productName: string;
  sku: string;
  categoryName: string;
  supplierName: string;
  unit: UnitType;
  currentStock: number;
  minStockLevel: number;
  leadTimeDays: number;
  safetyStock: number;
  unitPurchasePrice: number;
  forecast: ProductForecast;
}

export function computeRestockingRecommendation(
  input: RestockInput
): RestockingRecommendation {
  const avgDaily = input.forecast.averageDailyDemand;
  const leadTime = Math.max(1, input.leadTimeDays);
  const safety = Math.max(0, input.safetyStock);

  // Exact required formula: Reorder Point = Average Daily Demand × Supplier Lead Time + Safety Stock
  const reorderPoint = Math.ceil(avgDaily * leadTime + safety);

  const daysOfCover =
    avgDaily > 0
      ? Number((input.currentStock / avgDaily).toFixed(1))
      : input.currentStock > 0
      ? 999
      : 0;

  let status: RestockStatus;
  let reason = '';

  if (input.currentStock <= 0) {
    status = 'Restock immediately';
    reason = `Out of stock (0 ${input.unit} remaining). Reorder point is ${reorderPoint} ${input.unit} based on ${avgDaily.toFixed(2)}/day demand × ${leadTime}d lead time + ${safety} safety stock.`;
  } else if (input.currentStock <= reorderPoint && (avgDaily > 0 || input.currentStock <= input.minStockLevel)) {
    status = 'Restock immediately';
    reason = `Current stock (${input.currentStock} ${input.unit}) is at or below the reorder point of ${reorderPoint} ${input.unit} (${avgDaily.toFixed(2)}/day × ${leadTime}d lead time + ${safety} safety stock). Only ~${daysOfCover} days of cover left.`;
  } else if (avgDaily > 0 && daysOfCover <= leadTime + 5) {
    status = 'Restock soon';
    reason = `Stock (${input.currentStock} ${input.unit}) will cover ~${daysOfCover} days, approaching the ${leadTime}-day supplier lead time plus buffer. Reorder point is ${reorderPoint} ${input.unit}.`;
  } else if (
    (avgDaily > 0 && daysOfCover > 60) ||
    (avgDaily === 0 && input.currentStock > Math.max(safety * 3, 25))
  ) {
    status = 'Potential overstock';
    reason =
      avgDaily > 0
        ? `Current stock (${input.currentStock} ${input.unit}) covers ~${daysOfCover} days at current demand (${avgDaily.toFixed(2)}/day), tying up working capital.`
        : `High stock (${input.currentStock} ${input.unit}) with zero recent sales. Consider promotional pricing or bundling before buying more.`;
  } else if (avgDaily < 0.35 && input.currentStock > safety) {
    status = 'Product is moving slowly';
    reason = `Low sales velocity (${avgDaily.toFixed(2)} ${input.unit}/day) with ${input.currentStock} ${input.unit} in stock (~${daysOfCover === 999 ? '90+' : daysOfCover} days cover). Hold off on reordering.`;
  } else {
    status = 'Stock level is healthy';
    reason = `Current stock (${input.currentStock} ${input.unit}) is comfortably above the ${reorderPoint}-${input.unit} reorder point, covering ~${daysOfCover} days of forecasted demand.`;
  }

  let recommendedOrderQty = 0;
  if (status === 'Restock immediately' || status === 'Restock soon') {
    const targetStock = Math.max(
      reorderPoint + Math.ceil(avgDaily * 14),
      Math.ceil(input.forecast.forecast30d + safety)
    );
    recommendedOrderQty = Math.max(1, targetStock - input.currentStock);
  }

  const estimatedOrderCost = Math.round(recommendedOrderQty * input.unitPurchasePrice);

  return {
    productId: input.productId,
    productName: input.productName,
    sku: input.sku,
    categoryName: input.categoryName,
    supplierName: input.supplierName,
    unit: input.unit,
    currentStock: input.currentStock,
    averageDailyDemand: avgDaily,
    forecast7d: input.forecast.forecast7d,
    forecast30d: input.forecast.forecast30d,
    leadTimeDays: leadTime,
    safetyStock: safety,
    reorderPoint,
    daysOfCover,
    status,
    recommendedOrderQty,
    estimatedOrderCost,
    unitPurchasePrice: input.unitPurchasePrice,
    reason,
    insufficientData: input.forecast.insufficientData,
  };
}
