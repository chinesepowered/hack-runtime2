#!/usr/bin/env node
/**
 * The kid's wallet: a Dynamic server wallet the agent operates.
 *
 *   pnpm wallet create   create it (Linux/macOS only: Dynamic's MPC signer)
 *   pnpm wallet fund     parent "deposit": mint test dollars to it, plus gas
 *   pnpm wallet status   balances
 *
 * `create` writes the wallet's password and metadata into .env itself, so no
 * secret is ever printed. `fund` uses the deployer key (it owns fsUSD) and runs
 * anywhere.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, parseAbi, parseEther, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const d = JSON.parse(readFileSync('lib/deployments.json', 'utf8'));
const pub = createPublicClient({ chain: baseSepolia, transport: http() });
const die = m => { console.error(`\n  ${m}\n`); process.exit(1); };

/** Set keys in .env in place (never duplicate a key). */
function writeEnv(updates, file = '.env') {
  let text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, () => line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  }
  writeFileSync(file, text);
}

const kidAddress = () => {
  if (!process.env.KID_WALLET_METADATA) die('No KID_WALLET_METADATA in .env. Run `pnpm wallet create` first.');
  return JSON.parse(process.env.KID_WALLET_METADATA).accountAddress;
};

async function create() {
  if (process.env.KID_WALLET_METADATA) die('.env already has KID_WALLET_METADATA; refusing to replace a wallet that may hold funds.');
  const { DYNAMIC_ENV_ID, DYNAMIC_API_TOKEN } = process.env;
  if (!DYNAMIC_ENV_ID || !DYNAMIC_API_TOKEN) die('Set DYNAMIC_ENV_ID and DYNAMIC_API_TOKEN in .env first.');
  const { DynamicEvmWalletClient } = await import('@dynamic-labs-wallet/node-evm');
  const client = new DynamicEvmWalletClient({ environmentId: DYNAMIC_ENV_ID });
  await client.authenticateApiToken(DYNAMIC_API_TOKEN);
  const password = randomBytes(24).toString('hex');
  const { walletMetadata } = await client.createWalletAccount({ thresholdSignatureScheme: 'TWO_OF_TWO', password, backUpToDynamic: true });
  writeEnv({ KID_WALLET_PASSWORD: password, KID_WALLET_METADATA: JSON.stringify(walletMetadata) });
  console.log(`kid wallet: ${walletMetadata.accountAddress} (password and metadata saved to .env)`);
}

async function fund(usd = '100', eth = '0.0005') {
  const to = kidAddress();
  const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
  const mintAbi = parseAbi(['function mint(address,uint256)']);
  let h = await wallet.writeContract({ address: d.tokens.fsUSD.address, abi: mintAbi, functionName: 'mint', args: [to, parseUnits(usd, 6)] });
  await pub.waitForTransactionReceipt({ hash: h });
  console.log(`deposited ${usd} fsUSD → ${to}  ${h}`);
  h = await wallet.sendTransaction({ to, value: parseEther(eth) });
  await pub.waitForTransactionReceipt({ hash: h });
  console.log(`sent ${eth} ETH gas → ${to}  ${h}`);
}

async function status() {
  const who = kidAddress();
  console.log(`kid wallet ${who}`);
  console.log(`  ETH    ${formatEther(await pub.getBalance({ address: who }))}`);
  for (const [sym, t] of Object.entries(d.tokens)) {
    const bal = await pub.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [who] });
    console.log(`  ${sym.padEnd(6)} ${formatUnits(bal, t.decimals)}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'create') await create();
else if (cmd === 'fund') await fund(...args);
else if (cmd === 'status') await status();
else die('usage: pnpm wallet create | fund [usd] [eth] | status');
