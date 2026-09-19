import { STOCKS, type StockSymbol } from './chain';
import type { MarketQuote } from './prices';

/**
 * The parent's rule. Everything the agent does is derived from this in code —
 * there is no model deciding how a child's money is spent.
 */
export type Rule = {
  kidName: string;
  /** Dollars the agent may invest each Friday. */
  weeklyUsd: number;
  /** Percent of the weekly amount per stock; sums to 100. */
  split: Record<StockSymbol, number>;
  /** Skip a stock that rose more than this percent over the past week. */
  skipIfUpPct: number;
};

export const DEFAULT_RULE: Rule = {
  kidName: 'Maya',
  weeklyUsd: 10,
  split: { fsAAPL: 50, fsNVDA: 30, fsVOO: 20 },
  skipIfUpPct: 5,
};

/** The largest the Uniswap pool price may stray from the real market before the agent refuses to buy. */
export const MAX_POOL_DRIFT = 0.03;
/** Below this, a trade is not worth making. */
export const MIN_TRADE_USD = 0.5;

export type Plan = {
  symbol: StockSymbol;
  name: string;
  usd: number;
  action: 'buy' | 'skip';
  reason: string;
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const money = (x: number) => `$${x.toFixed(2)}`;

export function validateRule(input: unknown): { rule?: Rule; error?: string } {
  const r = input as Partial<Rule>;
  const weekly = Number(r?.weeklyUsd);
  if (!Number.isFinite(weekly) || weekly < 1 || weekly > 50) return { error: 'Weekly amount must be between $1 and $50.' };
  const split = {} as Record<StockSymbol, number>;
  let total = 0;
  for (const s of STOCKS) {
    const v = Math.round(Number(r?.split?.[s.symbol] ?? 0));
    if (!Number.isFinite(v) || v < 0 || v > 100) return { error: 'Each share of the split must be 0–100%.' };
    split[s.symbol] = v;
    total += v;
  }
  if (total !== 100) return { error: `The split must add up to 100% (it is ${total}%).` };
  const skip = Number(r?.skipIfUpPct);
  if (!Number.isFinite(skip) || skip < 1 || skip > 50) return { error: 'The "skip if it jumped" limit must be 1–50%.' };
  const kidName = String(r?.kidName ?? 'Maya').trim().slice(0, 24) || 'Maya';
  return { rule: { kidName, weeklyUsd: Math.round(weekly * 100) / 100, split, skipIfUpPct: skip } };
}

/** Plain-English summary of a rule, shown to the parent before saving. */
export function describeRule(rule: Rule): string {
  const parts = STOCKS.filter(s => rule.split[s.symbol] > 0).map(s => `${rule.split[s.symbol]}% ${s.name}`);
  return `Every Friday, invest ${money(rule.weeklyUsd)} for ${rule.kidName}: ${parts.join(', ')}. Skip anything that jumped more than ${rule.skipIfUpPct}% that week, and keep its share as cash for next time.`;
}

/**
 * First pass of the Friday decision, from market data alone. Pool checks and
 * quotes happen afterwards in the agent, against Uniswap itself.
 */
export function plan(rule: Rule, quotes: Record<StockSymbol, MarketQuote>, cashUsd: number): Plan[] {
  const budget = Math.min(rule.weeklyUsd, cashUsd);
  return STOCKS.filter(s => rule.split[s.symbol] > 0).map(s => {
    const usd = Math.floor(budget * rule.split[s.symbol]) / 100;
    const q = quotes[s.symbol];
    if (q.change5d * 100 > rule.skipIfUpPct) {
      return {
        symbol: s.symbol, name: s.name, usd, action: 'skip',
        reason: `${s.name} rose ${pct(q.change5d)} this week — more than the ${rule.skipIfUpPct}% limit. Its ${money(usd)} waits as cash.`,
      };
    }
    if (usd < MIN_TRADE_USD) {
      return { symbol: s.symbol, name: s.name, usd, action: 'skip', reason: `Only ${money(usd)} to invest — too small for a trade. It waits as cash.` };
    }
    const move = q.change5d >= 0 ? `up ${pct(q.change5d)}` : `down ${pct(-q.change5d)}`;
    return { symbol: s.symbol, name: s.name, usd, action: 'buy', reason: `${s.name} is ${move} this week, inside the ${rule.skipIfUpPct}% limit. Buying ${money(usd)}.` };
  });
}
