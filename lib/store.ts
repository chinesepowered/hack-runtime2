import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_RULE, type Rule } from './rules';

/**
 * Demo state (the parent's rule and a log of Friday runs) in a JSON file.
 * Holdings are never stored here: they are read from chain every time.
 * On Vercel the filesystem is read-only apart from /tmp, which is also
 * per-instance and ephemeral; a cold start begins from the default rule.
 */
const dataDir = () => (process.env.VERCEL ? '/tmp/first-share' : path.join(process.cwd(), '.data'));
const file = () => path.join(dataDir(), 'state.json');

export type RunLog = {
  id: string;
  at: string;
  live: boolean;
  buys: { symbol: string; usd: number; shares: string; hash: string }[];
  skips: { symbol: string; reason: string }[];
};
type State = { rule: Rule; runs: RunLog[] };

async function read(): Promise<State> {
  try {
    return JSON.parse(await readFile(file(), 'utf8')) as State;
  } catch {
    return { rule: DEFAULT_RULE, runs: [] };
  }
}

async function write(state: State): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  await writeFile(file(), JSON.stringify(state, null, 2), 'utf8');
}

export const getRule = async () => (await read()).rule;
export const getRuns = async () => (await read()).runs;

export async function saveRule(rule: Rule): Promise<void> {
  const s = await read();
  await write({ ...s, rule });
}

export async function addRun(run: RunLog): Promise<void> {
  const s = await read();
  await write({ ...s, runs: [run, ...s.runs].slice(0, 20) });
}
