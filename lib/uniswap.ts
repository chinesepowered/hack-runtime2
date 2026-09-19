import { encodeAbiParameters, encodeFunctionData, maxUint160, maxUint256, parseAbi, type Hex } from 'viem';
import { D, publicClient, type StockSymbol } from './chain';

/**
 * Everything First Share does with Uniswap v4 lives in this file.
 *
 *   quoteBuy()      V4Quoter.quoteExactInputSingle — what $X buys right now
 *   poolPriceUsd()  StateView.getSlot0 — the pool's current price
 *   buildBuy()      UniversalRouter.execute(V4_SWAP) — the swap the agent signs
 *   approvalsFor()  ERC-20 → Permit2 → UniversalRouter allowances the swap needs
 *
 * Pools are created and funded by scripts/setup-chain.mjs through the v4
 * PositionManager (initializePool + modifyLiquidities MINT_POSITION/SETTLE_PAIR).
 */

const POOL_KEY = {
  type: 'tuple',
  components: [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
  ],
} as const;

const quoterAbi = parseAbi([
  'function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)',
]);
const stateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
]);
const routerAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);
const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);
const permit2Abi = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
]);

/** Universal Router command and v4-periphery actions (v4-periphery/src/libraries/Actions.sol). */
const V4_SWAP = '0x10';
const ACTION = { SWAP_EXACT_IN_SINGLE: '06', SETTLE_ALL: '0c', TAKE_ALL: '0f' } as const;

const usd = () => D.tokens.fsUSD;
const pool = (symbol: StockSymbol) => D.pools[symbol];

/** Buying the stock spends fsUSD: zeroForOne is true when fsUSD is currency0. */
const buyIsZeroForOne = (symbol: StockSymbol) => !pool(symbol).stockIsToken0;

export async function quoteBuy(symbol: StockSymbol, usdIn: bigint): Promise<bigint> {
  const { result } = await publicClient.simulateContract({
    address: D.v4.quoter,
    abi: quoterAbi,
    functionName: 'quoteExactInputSingle',
    args: [{ poolKey: pool(symbol).key, zeroForOne: buyIsZeroForOne(symbol), exactAmount: usdIn, hookData: '0x' }],
  });
  return result[0];
}

/** USD per share implied by the pool's current sqrtPriceX96. */
export async function poolPriceUsd(symbol: StockSymbol): Promise<number> {
  const [sqrtPriceX96] = await publicClient.readContract({
    address: D.v4.stateView,
    abi: stateViewAbi,
    functionName: 'getSlot0',
    args: [pool(symbol).poolId],
  });
  const raw = (Number(sqrtPriceX96) / 2 ** 96) ** 2; // raw token1 per raw token0
  const stockDec = D.tokens[symbol].decimals;
  const usdDec = usd().decimals;
  return pool(symbol).stockIsToken0 ? raw * 10 ** (stockDec - usdDec) : 1 / (raw * 10 ** (usdDec - stockDec));
}

/**
 * The swap: exact fsUSD in, at least `minSharesOut` of the stock out.
 * V4_SWAP runs SWAP_EXACT_IN_SINGLE, then SETTLE_ALL pays fsUSD (via Permit2)
 * and TAKE_ALL sends the shares to the signer.
 */
export function buildBuy(symbol: StockSymbol, usdIn: bigint, minSharesOut: bigint): { to: Hex; data: Hex } {
  const p = pool(symbol);
  const stock = D.tokens[symbol].address;
  const actions = `0x${ACTION.SWAP_EXACT_IN_SINGLE}${ACTION.SETTLE_ALL}${ACTION.TAKE_ALL}` as Hex;
  const swap = encodeAbiParameters(
    [{ type: 'tuple', components: [POOL_KEY, { type: 'bool' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'bytes' }] }],
    [[p.key, buyIsZeroForOne(symbol), usdIn, minSharesOut, '0x']],
  );
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [usd().address, usdIn]);
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [stock, minSharesOut]);
  const input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [swap, settle, take]]);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  return {
    to: D.v4.universalRouter,
    data: encodeFunctionData({ abi: routerAbi, functionName: 'execute', args: [V4_SWAP, [input], deadline] }),
  };
}

/**
 * One-time allowances for `owner` to swap fsUSD through the Universal Router:
 * fsUSD → Permit2 (ERC-20 approve), then Permit2 → Universal Router.
 * Returns only the transactions still needed.
 */
export async function approvalsFor(owner: Hex): Promise<{ label: string; to: Hex; data: Hex }[]> {
  const needed: { label: string; to: Hex; data: Hex }[] = [];
  const token = usd().address;
  const erc = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, D.v4.permit2] });
  if (erc < maxUint160) {
    needed.push({
      label: 'Allow Permit2 to move test dollars',
      to: token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [D.v4.permit2, maxUint256] }),
    });
  }
  const [amount, expiration] = await publicClient.readContract({
    address: D.v4.permit2,
    abi: permit2Abi,
    functionName: 'allowance',
    args: [owner, token, D.v4.universalRouter],
  });
  if (amount < maxUint160 / 2n || expiration * 1000 < Date.now() + 86_400_000) {
    needed.push({
      label: 'Allow the Uniswap router via Permit2',
      to: D.v4.permit2,
      data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [token, D.v4.universalRouter, maxUint160, 2 ** 47] }),
    });
  }
  return needed;
}
