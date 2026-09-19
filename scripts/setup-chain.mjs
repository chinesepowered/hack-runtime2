#!/usr/bin/env node
/**
 * One-time chain setup on Base Sepolia:
 *   1. deploy test tokens: fsUSD (test dollars) and three tokenized-stock stand-ins
 *   2. create a Uniswap v4 pool for each stock against fsUSD, priced at the
 *      stock's real last close (Yahoo Finance)
 *   3. add full-range liquidity through the production v4 PositionManager
 *
 * Resumable: progress is written to lib/deployments.json after every step, so a
 * failure part-way never redeploys what already exists.
 *
 *   pnpm setup:chain      (needs DEPLOYER_PRIVATE_KEY with a little Base Sepolia ETH)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  createPublicClient, createWalletClient, encodeAbiParameters, http, keccak256, maxUint160, maxUint256,
  parseAbi, parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const OUT = 'lib/deployments.json';
const TOKEN = JSON.parse(readFileSync('contracts/TestToken.json', 'utf8'));

// Uniswap v4 on Base Sepolia — developers.uniswap.org/docs/protocols/v4/deployments
const V4 = {
  poolManager: '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408',
  positionManager: '0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80',
  universalRouter: '0x492e6456d9528771018deb9e87ef7750ef184104',
  quoter: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba',
  stateView: '0x571291b572ed32ce6751a2cb2486ebee8defb9b4',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
};
const FEE = 3000;          // 0.30%
const TICK_SPACING = 60;
const TICK_LOWER = -887220; // full range, aligned to spacing 60
const TICK_UPPER = 887220;
const HOOKS = '0x0000000000000000000000000000000000000000';
const LIQUIDITY_USD = 500_000; // per side, per pool: kid-sized buys move the price by fractions of a cent

const STOCKS = [
  { symbol: 'fsAAPL', ticker: 'AAPL', name: 'First Share Test Apple (not a security)' },
  { symbol: 'fsNVDA', ticker: 'NVDA', name: 'First Share Test Nvidia (not a security)' },
  { symbol: 'fsVOO', ticker: 'VOO', name: 'First Share Test S&P 500 (not a security)' },
];

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const pub = createPublicClient({ chain: baseSepolia, transport: http() });
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });

const state = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { chainId: 84532, v4: V4, tokens: {}, pools: {} };
const save = () => writeFileSync(OUT, JSON.stringify(state, null, 2) + '\n');

/**
 * Public Base Sepolia RPC is load-balanced; a node a block behind can reject
 * gas estimation for a call that depends on a just-confirmed approval. Retry
 * reverts a few times before treating them as real.
 */
async function send(label, request) {
  let hash;
  for (let attempt = 1; ; attempt++) {
    try {
      hash = await wallet.writeContract(request);
      break;
    } catch (err) {
      if (attempt >= 4) throw err;
      console.log(`  ${label}: estimate reverted (attempt ${attempt}), retrying in 4s…`);
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== 'success') throw new Error(`${label} reverted: ${hash}`);
  console.log(`  ${label.padEnd(34)} ${hash}`);
  return receipt;
}

async function deployToken(symbol, name, decimals) {
  if (state.tokens[symbol]) return state.tokens[symbol].address;
  const hash = await wallet.deployContract({ abi: TOKEN.abi, bytecode: TOKEN.bytecode, args: [name, symbol, decimals] });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (!receipt.contractAddress) throw new Error(`deploy ${symbol} failed`);
  state.tokens[symbol] = { address: receipt.contractAddress, decimals, name };
  save();
  console.log(`  deployed ${symbol.padEnd(8)} ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

async function lastClose(ticker) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`, {
    headers: { 'user-agent': 'Mozilla/5.0' },
  });
  const meta = (await res.json()).chart.result[0].meta;
  return { price: meta.regularMarketPrice, at: new Date(meta.regularMarketTime * 1000).toISOString() };
}

/** Integer square root (Newton) for BigInt. */
function isqrt(n) {
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

/**
 * sqrtPriceX96 for the pool, where v4 price = raw token1 per raw token0.
 * Prices are handled as integer micro-dollars to avoid float drift.
 */
function sqrtPriceX96For(priceUsd, stockIsToken0, stockDecimals, usdDecimals) {
  const micro = BigInt(Math.round(priceUsd * 1e6)); // USD * 1e6
  const Q192 = 1n << 192n;
  // raw USD per raw stock = micro * 10^usdDecimals / (1e6 * 10^stockDecimals)
  const num = micro * 10n ** BigInt(usdDecimals);
  const den = 1_000_000n * 10n ** BigInt(stockDecimals);
  return stockIsToken0 ? isqrt((num * Q192) / den) : isqrt((den * Q192) / num);
}

const poolKeyType = [{
  type: 'tuple',
  components: [
    { name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' },
  ],
}];
const poolIdOf = key => keccak256(encodeAbiParameters(poolKeyType, [key]));

const erc20 = parseAbi([
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function mint(address,uint256)',
  'function balanceOf(address) view returns (uint256)',
]);
const permit2Abi = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
]);
const posmAbi = parseAbi([
  'function initializePool((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key, uint160 sqrtPriceX96) payable returns (int24)',
  'function modifyLiquidities(bytes unlockData, uint256 deadline) payable',
]);
const stateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128)',
]);

async function ensurePermit2(token, spender) {
  if ((await pub.readContract({ address: token, abi: erc20, functionName: 'allowance', args: [account.address, V4.permit2] })) < maxUint160) {
    await send(`approve Permit2 for ${token.slice(0, 8)}`, { address: token, abi: erc20, functionName: 'approve', args: [V4.permit2, maxUint256] });
  }
  const [amount] = await pub.readContract({ address: V4.permit2, abi: permit2Abi, functionName: 'allowance', args: [account.address, token, spender] });
  if (amount < maxUint160 / 2n) {
    await send(`Permit2 → ${spender.slice(0, 8)} ${token.slice(0, 8)}`, {
      address: V4.permit2, abi: permit2Abi, functionName: 'approve', args: [token, spender, maxUint160, 2 ** 47],
    });
  }
}

console.log(`deployer ${account.address}`);

// 1. Tokens
const usd = await deployToken('fsUSD', 'First Share Test Dollar (not real money)', 6);
for (const s of STOCKS) await deployToken(s.symbol, s.name, 18);

// 2 + 3. Pools and liquidity
for (const s of STOCKS) {
  if (state.pools[s.symbol]?.liquidityAdded) continue;
  const stock = state.tokens[s.symbol].address;
  const stockIsToken0 = stock.toLowerCase() < usd.toLowerCase();
  const key = {
    currency0: stockIsToken0 ? stock : usd,
    currency1: stockIsToken0 ? usd : stock,
    fee: FEE, tickSpacing: TICK_SPACING, hooks: HOOKS,
  };
  const poolId = poolIdOf(key);
  const quote = await lastClose(s.ticker);
  console.log(`\n${s.symbol}: ${s.ticker} last close $${quote.price} (${quote.at}) | poolId ${poolId}`);

  const sqrtPriceX96 = sqrtPriceX96For(quote.price, stockIsToken0, 18, 6);
  state.pools[s.symbol] = { ticker: s.ticker, key, poolId, stockIsToken0, seedPrice: quote.price, seedPriceAt: quote.at, sqrtPriceX96: sqrtPriceX96.toString() };
  save();

  const [slot0Sqrt] = await pub.readContract({ address: V4.stateView, abi: stateViewAbi, functionName: 'getSlot0', args: [poolId] });
  if (slot0Sqrt === 0n) {
    await send(`initialize ${s.symbol} pool`, { address: V4.positionManager, abi: posmAbi, functionName: 'initializePool', args: [key, sqrtPriceX96] });
  }

  // Amounts: $LIQUIDITY_USD of each side.
  const usdAmount = parseUnits(String(LIQUIDITY_USD), 6);
  const stockAmount = parseUnits((LIQUIDITY_USD / quote.price).toFixed(18), 18);
  // Mint only what is missing, so a rerun after a failure never double-mints.
  const balOf = t => pub.readContract({ address: t, abi: erc20, functionName: 'balanceOf', args: [account.address] });
  if ((await balOf(stock)) < stockAmount) {
    await send(`mint ${s.symbol} to deployer`, { address: stock, abi: erc20, functionName: 'mint', args: [account.address, stockAmount] });
  }
  if ((await balOf(usd)) < usdAmount) {
    await send(`mint fsUSD for ${s.symbol} pool`, { address: usd, abi: erc20, functionName: 'mint', args: [account.address, usdAmount] });
  }
  await ensurePermit2(stock, V4.positionManager);
  await ensurePermit2(usd, V4.positionManager);

  // Full-range liquidity ≈ min(amount0 * sqrtP, amount1 / sqrtP), trimmed 1% so
  // the exact amounts the pool asks for always fit under the maxima.
  const Q96 = 1n << 96n;
  const amount0 = stockIsToken0 ? stockAmount : usdAmount;
  const amount1 = stockIsToken0 ? usdAmount : stockAmount;
  const l0 = (amount0 * sqrtPriceX96) / Q96;
  const l1 = (amount1 * Q96) / sqrtPriceX96;
  const liquidity = ((l0 < l1 ? l0 : l1) * 99n) / 100n;

  // v4-periphery Actions: MINT_POSITION = 0x02, SETTLE_PAIR = 0x0d
  const actions = '0x020d';
  const mintParams = encodeAbiParameters(
    [...poolKeyType, { type: 'int24' }, { type: 'int24' }, { type: 'uint256' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'address' }, { type: 'bytes' }],
    [key, TICK_LOWER, TICK_UPPER, liquidity, amount0, amount1, account.address, '0x'],
  );
  const settleParams = encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [key.currency0, key.currency1]);
  const unlockData = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [mintParams, settleParams]]);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  await send(`add liquidity ${s.symbol}`, { address: V4.positionManager, abi: posmAbi, functionName: 'modifyLiquidities', args: [unlockData, deadline] });

  const [sqrtNow, tick] = await pub.readContract({ address: V4.stateView, abi: stateViewAbi, functionName: 'getSlot0', args: [poolId] });
  const L = await pub.readContract({ address: V4.stateView, abi: stateViewAbi, functionName: 'getLiquidity', args: [poolId] });
  state.pools[s.symbol].liquidityAdded = true;
  state.pools[s.symbol].tick = tick;
  save();
  console.log(`  pool live: tick ${tick}, liquidity ${L}, sqrtPriceX96 ${sqrtNow}`);
}

console.log(`\ndone → ${OUT}`);
