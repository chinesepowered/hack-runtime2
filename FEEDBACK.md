# Uniswap developer feedback

Written while building First Share on Uniswap v4 (Base Sepolia) in one night: three pools created
and funded through the PositionManager, quotes through V4Quoter, prices through StateView, and swaps
through the Universal Router — all hand-encoded with viem, no SDK.

## What worked well

- **The deployments page was exactly what we needed.** Every Base Sepolia address (PoolManager,
  PositionManager, UniversalRouter, V4Quoter, StateView, Permit2) in one table, linked to verified
  source. We never had to hunt for an address.
- **StateView + V4Quoter make pre-trade checks easy.** Our agent reads `getSlot0` to compare the pool
  against the real market and refuses to trade if they've drifted, then quotes the exact output
  before signing. That guard was a few lines, and it's the most judge-visible safety feature we have.
- **Pools priced exactly as intended.** Initializing at a computed `sqrtPriceX96` and minting full
  range landed each pool at the real stock close to the cent, first try.
- **Flash accounting reads well once it clicks.** `SWAP_EXACT_IN_SINGLE → SETTLE_ALL → TAKE_ALL` is a
  clean mental model for a single swap, and `MINT_POSITION → SETTLE_PAIR` for liquidity.

## Friction we hit

1. **Action encoding without the SDK.** To call `modifyLiquidities` and `UniversalRouter.execute`
   directly, we had to read `Actions.sol` for the action bytes and infer each param struct's layout.
   A single reference page listing every action byte with its exact `abi.encode` parameter types
   (and the `V4_SWAP` input shape) would have saved the most time. Many agent builders use viem, not
   ethers-based SDKs.
2. **`AllowanceExpired(0)` when the allowance simply wasn't visible yet.** Right after confirming a
   Permit2 approval, gas estimation on the public Base Sepolia RPC sometimes hit a node a block
   behind, and `modifyLiquidities` reverted with `AllowanceExpired(uint256)` — which reads like a
   stale expiry, not "no allowance". A distinct error (or a doc note that an unset allowance reports
   as expired at `0`) would make this much faster to diagnose.
3. **Two approvals before an agent's first swap.** ERC-20 → Permit2, then Permit2 → Universal Router.
   Sensible, but for server-side agent wallets it's two extra signed transactions before anything
   happens. A short "server-side agent" recipe showing the minimal first-swap sequence would help.
4. **Full-range liquidity math.** We computed liquidity from amounts with an approximation for full
   range rather than port TickMath. A tiny documented helper (or formula) for "liquidity from
   amounts, full range" would remove guesswork.
5. **The V4Quoter isn't a view function.** Calling it needs `eth_call`/`simulateContract`, which is
   documented but easy to miss when a quoter "sounds" read-only.
6. **Docs moved.** `docs.uniswap.org/contracts/v4/deployments` now 301s to `developers.uniswap.org`;
   a few search results and older links still point at the old host.

## What we'd love

- A viem-first v4 cookbook: initialize, mint full range, swap exact-in single, all as raw calldata.
- Testnet guidance for **tokenized real-world assets**: seeding a pool at an external price, and
  keeping it anchored (we built a pool-vs-market guard; a documented pattern or hook example for
  oracle-anchored RWA pools would be valuable).
