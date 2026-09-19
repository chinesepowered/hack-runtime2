import { NextResponse } from 'next/server';
import { D, STOCKS } from '@/lib/chain';
import { canDeposit } from '@/lib/deposit';
import { readPortfolio } from '@/lib/portfolio';
import { describeRule } from '@/lib/rules';
import { canSign, kidAddress, SIGNER_SUPPORTED } from '@/lib/signer';
import { getRule, getRuns } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const address = kidAddress();
  const [rule, runs, portfolio] = await Promise.all([getRule(), getRuns(), address ? readPortfolio(address) : null]);
  return NextResponse.json({
    rule,
    ruleText: describeRule(rule),
    portfolio,
    runs,
    stocks: STOCKS,
    pools: D.pools,
    live: { canSign: canSign(), signerSupported: SIGNER_SUPPORTED, canDeposit: canDeposit() },
  });
}
