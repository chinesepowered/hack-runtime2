import { NextResponse } from 'next/server';
import { describeRule, validateRule } from '@/lib/rules';
import { saveRule } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { rule, error } = validateRule(await request.json().catch(() => null));
  if (!rule) return NextResponse.json({ error }, { status: 400 });
  await saveRule(rule);
  return NextResponse.json({ rule, ruleText: describeRule(rule) });
}
