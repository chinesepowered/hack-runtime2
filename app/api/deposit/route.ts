import { NextResponse } from 'next/server';
import { deposit } from '@/lib/deposit';
import { kidAddress } from '@/lib/signer';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { usd?: number };
  const usd = Number(body.usd);
  if (![10, 25, 50].includes(usd)) return NextResponse.json({ error: 'Choose $10, $25 or $50.' }, { status: 400 });
  const to = kidAddress();
  if (!to) return NextResponse.json({ error: 'No kid wallet is configured.' }, { status: 500 });
  const result = await deposit(to, usd);
  return NextResponse.json(result, { status: 'error' in result ? 400 : 200 });
}
