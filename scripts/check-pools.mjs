#!/usr/bin/env node
/**
 * Read each pool back from chain: liquidity, implied price vs the seed quote,
 * and a V4Quoter quote for a $5 buy. A sanity check after setup-chain.
 */
import { readFileSync } from 'node:fs';
import { createPublicClient, formatUnits, http, parseAbi, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';

const d = JSON.parse(readFileSync('lib/deployments.json', 'utf8'));
const pub = createPublicClient({ chain: baseSepolia, transport: http() });
const stateView = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128)',
]);
const quoter = parseAbi([
  'function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)',
]);

for (const [symbol, p] of Object.entries(d.pools)) {
  const [sqrt] = await pub.readContract({ address: d.v4.stateView, abi: stateView, functionName: 'getSlot0', args: [p.poolId] });
  const liquidity = await pub.readContract({ address: d.v4.stateView, abi: stateView, functionName: 'getLiquidity', args: [p.poolId] });
  // raw token1 per raw token0, then to USD per stock
  const raw = (Number(sqrt) / 2 ** 96) ** 2;
  const usdPerStock = p.stockIsToken0 ? raw * 1e18 / 1e6 : 1 / (raw * 1e6 / 1e18);

  // $5 of fsUSD in → stock out. USD is currency1 when the stock is token0, so zeroForOne = false.
  const { result } = await pub.simulateContract({
    address: d.v4.quoter, abi: quoter, functionName: 'quoteExactInputSingle',
    args: [{ poolKey: p.key, zeroForOne: !p.stockIsToken0, exactAmount: parseUnits('5', 6), hookData: '0x' }],
  });
  const out = Number(formatUnits(result[0], 18));
  console.log(
    `${symbol.padEnd(7)} liquidity ${liquidity > 0n ? 'OK ' : 'ZERO'} | pool price $${usdPerStock.toFixed(2)} vs seed $${p.seedPrice}` +
    ` | $5 buys ${out.toFixed(6)} shares (effective $${(5 / out).toFixed(2)}/share incl. 0.3% fee)`,
  );
}
