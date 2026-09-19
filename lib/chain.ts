import { createPublicClient, http, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import deployments from './deployments.json';

export type PoolKey = { currency0: Hex; currency1: Hex; fee: number; tickSpacing: number; hooks: Hex };
export type PoolInfo = {
  ticker: string;
  key: PoolKey;
  poolId: Hex;
  stockIsToken0: boolean;
  seedPrice: number;
  seedPriceAt: string;
};
type Deployments = {
  chainId: number;
  v4: Record<'poolManager' | 'positionManager' | 'universalRouter' | 'quoter' | 'stateView' | 'permit2', Hex>;
  tokens: Record<string, { address: Hex; decimals: number; name: string }>;
  pools: Record<string, PoolInfo>;
};

/** Contract addresses written by scripts/setup-chain.mjs. Public on-chain data. */
export const D = deployments as unknown as Deployments;

export const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

export const txUrl = (hash: string) => `https://sepolia.basescan.org/tx/${hash}`;
export const addressUrl = (address: string) => `https://sepolia.basescan.org/address/${address}`;

/** The three stocks a kid can own, as tokenized testnet stand-ins. */
export const STOCKS = [
  { symbol: 'fsAAPL', ticker: 'AAPL', name: 'Apple', blurb: 'makes the iPad and the iPhone', color: '#E8735A' },
  { symbol: 'fsNVDA', ticker: 'NVDA', name: 'Nvidia', blurb: 'makes the chips that video games and AI run on', color: '#2F6B4F' },
  { symbol: 'fsVOO', ticker: 'VOO', name: 'S&P 500', blurb: 'a little piece of 500 big American companies at once', color: '#C9962A' },
] as const;
export type StockSymbol = (typeof STOCKS)[number]['symbol'];
