import { DEFAULT_FEE_PERCENT } from "./constants";
import type { SupportedSymbol, TradeSide } from "./types";

/**
 * Estimate trade quantity for a given GBP amount and price.
 */
export function estimateQuantity(params: {
  amountGbp: number,
  entryPrice: number,
  stepSize?: number
}): number {
  const rawQty = params.amountGbp / params.entryPrice;
  // Optionally round to step size
  if (params.stepSize)
    return Math.floor(rawQty / params.stepSize) * params.stepSize;
  return rawQty;
}

/**
 * Estimate gross exit amount for quantity and exit price.
 */
export function estimatedGrossExit(params: {
  quantity: number,
  exitPrice: number
}): number {
  return params.quantity * params.exitPrice;
}

/**
 * Estimate exchange fee for a trade.
 */
export function estimateFee(params: {
  quantity: number,
  price: number,
  feePercent?: number
}): number {
  const { quantity, price, feePercent } = params;
  return quantity * price * (feePercent ?? DEFAULT_FEE_PERCENT);
}

/**
 * Estimate net (entry/exit less fees).
 */
export function estimateNet(params: {
  side: TradeSide,
  entryPrice: number,
  quantity: number,
  feePercent?: number
}): number {
  // Net after buy or sell (fees apply both sides, but for preview we can show one leg)
  const fee = estimateFee({ quantity: params.quantity, price: params.entryPrice, feePercent: params.feePercent });
  if (params.side === "buy") return (params.quantity * params.entryPrice) + fee;
  else return (params.quantity * params.entryPrice) - fee;
}

/**
 * Compute break-even price including fee.
 */
export function breakEvenPrice(params: {
  entryPrice: number,
  feePercent?: number
}): number {
  const { entryPrice, feePercent } = params;
  // Two legs: entry+exit both charged fee
  return entryPrice * (1 + 2 * (feePercent ?? DEFAULT_FEE_PERCENT));
}

/**
 * Calculate realized PnL.
 */
export function realizedProfitLoss(params: {
  quantity: number,
  entryPrice: number,
  exitPrice: number,
  feePercent?: number
}): number {
  const gross = (params.exitPrice - params.entryPrice) * params.quantity;
  // Fees always subtracted on both sides
  const totalFee = params.quantity * (params.entryPrice + params.exitPrice) * (params.feePercent ?? DEFAULT_FEE_PERCENT);
  return gross - totalFee;
}