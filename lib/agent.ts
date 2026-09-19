import { formatUnits, parseUnits } from 'viem';
import { D, STOCKS, txUrl, type StockSymbol } from './chain';
import { marketQuote, type MarketQuote } from './prices';
import { readPortfolio } from './portfolio';
import { MAX_POOL_DRIFT, plan, type Rule } from './rules';
import { canSign, kidAddress, sendFromKid } from './signer';
import { addRun, type RunLog } from './store';
import { approvalsFor, buildBuy, poolPriceUsd, quoteBuy } from './uniswap';

/** Everything the agent does, as a stream the UI renders step by step. */
export type AgentEvent =
  | { type: 'start'; kidName: string; cashUsd: number; weeklyUsd: number }
  | { type: 'market'; symbol: StockSymbol; name: string; quote: MarketQuote }
  | { type: 'decide'; symbol: StockSymbol; name: string; action: 'buy' | 'skip'; usd: number; reason: string }
  | { type: 'pool'; symbol: StockSymbol; name: string; poolPrice: number; marketPrice: number; drift: number; shares: number; effectivePrice: number }
  | { type: 'guard'; symbol: StockSymbol; name: string; reason: string }
  | { type: 'approve'; label: string; hash: string; url: string }
  | { type: 'swap'; symbol: StockSymbol; name: string; usd: number; shares: number; hash: string; url: string; ok: boolean }
  | { type: 'unavailable'; reason: string }
  | { type: 'done'; bought: number; skipped: number; spentUsd: number }
  | { type: 'error'; message: string };

const SLIPPAGE = 0.01;

export async function* runFriday(rule: Rule): AsyncGenerator<AgentEvent> {
  const address = kidAddress();
  if (!address) {
    yield { type: 'error', message: 'No kid wallet is configured.' };
    return;
  }
  const portfolio = await readPortfolio(address);
  yield { type: 'start', kidName: rule.kidName, cashUsd: portfolio.cashUsd, weeklyUsd: rule.weeklyUsd };

  // 1. Look at the real market.
  const quotes = {} as Record<StockSymbol, MarketQuote>;
  for (const s of STOCKS) {
    quotes[s.symbol] = await marketQuote(s.ticker);
    yield { type: 'market', symbol: s.symbol, name: s.name, quote: quotes[s.symbol] };
  }

  // 2. Apply the parent's rule.
  const plans = plan(rule, quotes, portfolio.cashUsd);
  for (const p of plans) yield { type: 'decide', ...p };

  // 3. Check each buy against Uniswap: is the pool's price sane, and what does the money buy?
  const buys: { symbol: StockSymbol; name: string; usdIn: bigint; usd: number; minOut: bigint; shares: number }[] = [];
  const skips: RunLog['skips'] = plans.filter(p => p.action === 'skip').map(p => ({ symbol: p.symbol, reason: p.reason }));
  for (const p of plans.filter(x => x.action === 'buy')) {
    const usdIn = parseUnits(p.usd.toFixed(2), D.tokens.fsUSD.decimals);
    const [poolPrice, sharesOut] = await Promise.all([poolPriceUsd(p.symbol), quoteBuy(p.symbol, usdIn)]);
    const marketPrice = quotes[p.symbol].price;
    const drift = Math.abs(poolPrice / marketPrice - 1);
    const shares = Number(formatUnits(sharesOut, D.tokens[p.symbol].decimals));
    yield { type: 'pool', symbol: p.symbol, name: p.name, poolPrice, marketPrice, drift, shares, effectivePrice: p.usd / shares };
    if (drift > MAX_POOL_DRIFT) {
      const reason = `The Uniswap pool prices ${p.name} at $${poolPrice.toFixed(2)}, ${(drift * 100).toFixed(1)}% away from the market's $${marketPrice.toFixed(2)}. Not buying at a bad price.`;
      skips.push({ symbol: p.symbol, reason });
      yield { type: 'guard', symbol: p.symbol, name: p.name, reason };
      continue;
    }
    const minOut = (sharesOut * BigInt(Math.round((1 - SLIPPAGE) * 10_000))) / 10_000n;
    buys.push({ symbol: p.symbol, name: p.name, usdIn, usd: p.usd, minOut, shares });
  }

  // 4. Act, with the kid's own Dynamic wallet.
  const log: RunLog = { id: crypto.randomUUID(), at: new Date().toISOString(), live: false, buys: [], skips };
  if (buys.length && !canSign()) {
    yield { type: 'unavailable', reason: "This server can't sign with Dynamic's wallet here (its signer runs on Linux and macOS), so no trades were placed." };
  } else if (buys.length) {
    for (const approval of await approvalsFor(address)) {
      const { hash } = await sendFromKid(approval);
      yield { type: 'approve', label: approval.label, hash, url: txUrl(hash) };
    }
    for (const b of buys) {
      const { hash, ok } = await sendFromKid(buildBuy(b.symbol, b.usdIn, b.minOut));
      yield { type: 'swap', symbol: b.symbol, name: b.name, usd: b.usd, shares: b.shares, hash, url: txUrl(hash), ok };
      if (ok) log.buys.push({ symbol: b.symbol, usd: b.usd, shares: b.shares.toFixed(6), hash });
    }
    log.live = log.buys.length > 0;
  }

  await addRun(log);
  yield {
    type: 'done',
    bought: log.buys.length,
    skipped: skips.length,
    spentUsd: log.buys.reduce((sum, b) => sum + b.usd, 0),
  };
}
