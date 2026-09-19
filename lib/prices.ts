import { D } from './chain';

export type MarketQuote = {
  ticker: string;
  price: number;
  /** Change over the last five trading sessions, as a fraction (0.05 = +5%). */
  change5d: number;
  asOf: string;
  source: 'yahoo' | 'seed';
};

const cache = new Map<string, { at: number; quote: MarketQuote }>();
const TTL_MS = 5 * 60_000;

/**
 * Real market data for the stock a token stands in for (Yahoo Finance chart
 * API, no key). If it is unreachable, fall back to the price the pool was
 * seeded at and say so — the agent never invents a price.
 */
export async function marketQuote(ticker: string): Promise<MarketQuote> {
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.quote;
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const result = (await res.json()).chart.result[0];
    const closes: number[] = result.indicators.quote[0].close.filter((c: number | null) => c != null);
    const price: number = result.meta.regularMarketPrice;
    const weekAgo = closes.at(-6) ?? closes[0];
    const quote: MarketQuote = {
      ticker,
      price,
      change5d: price / weekAgo - 1,
      asOf: new Date(result.meta.regularMarketTime * 1000).toISOString(),
      source: 'yahoo',
    };
    cache.set(ticker, { at: Date.now(), quote });
    return quote;
  } catch {
    const seed = Object.values(D.pools).find(p => p.ticker === ticker);
    return { ticker, price: seed?.seedPrice ?? 0, change5d: 0, asOf: seed?.seedPriceAt ?? '', source: 'seed' };
  }
}
