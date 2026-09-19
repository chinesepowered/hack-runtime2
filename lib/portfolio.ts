import { erc20Abi, formatUnits, type Hex } from 'viem';
import { D, publicClient, STOCKS, type StockSymbol } from './chain';
import { marketQuote } from './prices';

export type Holding = {
  symbol: StockSymbol;
  name: string;
  ticker: string;
  blurb: string;
  color: string;
  shares: number;
  price: number;
  valueUsd: number;
};
export type Portfolio = { address: Hex; cashUsd: number; holdings: Holding[]; investedUsd: number };

/** The kid's holdings, read from chain; valued at the real market price. */
export async function readPortfolio(address: Hex): Promise<Portfolio> {
  const balance = (token: Hex) =>
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] });

  const [cashRaw, ...stockRaw] = await Promise.all([
    balance(D.tokens.fsUSD.address),
    ...STOCKS.map(s => balance(D.tokens[s.symbol].address)),
  ]);
  const quotes = await Promise.all(STOCKS.map(s => marketQuote(s.ticker)));

  const holdings = STOCKS.map((s, i) => {
    const shares = Number(formatUnits(stockRaw[i], D.tokens[s.symbol].decimals));
    return {
      symbol: s.symbol, name: s.name, ticker: s.ticker, blurb: s.blurb, color: s.color,
      shares, price: quotes[i].price, valueUsd: shares * quotes[i].price,
    };
  });
  return {
    address,
    cashUsd: Number(formatUnits(cashRaw, D.tokens.fsUSD.decimals)),
    holdings,
    investedUsd: holdings.reduce((sum, h) => sum + h.valueUsd, 0),
  };
}
