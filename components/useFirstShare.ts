'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Portfolio } from '@/lib/portfolio';
import type { Rule } from '@/lib/rules';
import type { RunLog } from '@/lib/store';

export type AppState = {
  rule: Rule;
  ruleText: string;
  portfolio: Portfolio | null;
  runs: RunLog[];
  live: { canSign: boolean; signerSupported: boolean; canDeposit: boolean };
};

export function useFirstShare() {
  const [state, setState] = useState<AppState | null>(null);
  const reload = useCallback(async () => {
    const res = await fetch('/api/state', { cache: 'no-store' });
    setState(await res.json());
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { state, reload };
}

export const usd = (n: number) => `$${n.toFixed(2)}`;

/** "about 1/67 of a share" — fractions a kid can picture. */
export function shareWords(shares: number): string {
  if (shares <= 0) return 'nothing yet';
  if (shares >= 1) return `${shares.toFixed(2)} shares`;
  return `about 1/${Math.max(2, Math.round(1 / shares))} of a share`;
}

/** Fridays until a whole share at the current rule and price. */
export function fridaysToWhole(shares: number, weeklyUsd: number, splitPct: number, price: number): number | null {
  const perWeek = (weeklyUsd * splitPct) / 100 / price;
  if (shares >= 1) return 0;
  if (perWeek <= 0) return null;
  return Math.ceil((1 - shares) / perWeek);
}
