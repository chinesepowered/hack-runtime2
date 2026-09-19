import { createWalletClient, erc20Abi, formatUnits, http, parseAbi, parseEther, parseUnits, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { D, publicClient, txUrl } from './chain';

/**
 * The parent's deposit. On testnet the "money" is fsUSD, a test token the
 * deployer can mint, so a deposit mints test dollars to the kid's wallet — the
 * UI says exactly that. In production this would be a USDC transfer from the
 * parent. It also tops up the kid wallet's gas if it is running low, so a
 * public demo keeps working however many times it is used.
 */
const KEY = process.env.DEPLOYER_PRIVATE_KEY ?? '';
const MAX_CASH_USD = 200;
const GAS_FLOOR = parseEther('0.0002');
const GAS_TOPUP = parseEther('0.0003');

export const canDeposit = () => /^0x[0-9a-fA-F]{64}$/.test(KEY);

export async function deposit(to: Hex, usd: number): Promise<{ url: string; gasUrl?: string } | { error: string }> {
  if (!canDeposit()) return { error: 'Deposits are not configured on this server.' };
  const cash = Number(
    formatUnits(
      await publicClient.readContract({ address: D.tokens.fsUSD.address, abi: erc20Abi, functionName: 'balanceOf', args: [to] }),
      D.tokens.fsUSD.decimals,
    ),
  );
  if (cash + usd > MAX_CASH_USD) return { error: `The jar already holds $${cash.toFixed(2)} — that's plenty for now.` };

  const account = privateKeyToAccount(KEY as Hex);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
  const hash = await wallet.writeContract({
    address: D.tokens.fsUSD.address,
    abi: parseAbi(['function mint(address to, uint256 value)']),
    functionName: 'mint',
    args: [to, parseUnits(String(usd), D.tokens.fsUSD.decimals)],
  });
  await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });

  let gasUrl: string | undefined;
  if ((await publicClient.getBalance({ address: to })) < GAS_FLOOR) {
    const g = await wallet.sendTransaction({ to, value: GAS_TOPUP });
    await publicClient.waitForTransactionReceipt({ hash: g, timeout: 60_000 });
    gasUrl = txUrl(g);
  }
  return { url: txUrl(hash), gasUrl };
}
