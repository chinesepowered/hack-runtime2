'use client';

import Link from 'next/link';
import { Plant } from '@/components/Plant';
import { fridaysToWhole, shareWords, usd, useFirstShare } from '@/components/useFirstShare';
import { addressUrl } from '@/lib/chain';

export default function Home() {
  const { state } = useFirstShare();
  const kid = state?.rule.kidName ?? 'Maya';
  const p = state?.portfolio;

  return (
    <div className="page">
      <p className="eyebrow">First Share</p>
      <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', lineHeight: 1.02, margin: '0.6rem 0 1rem' }}>
        {kid}&apos;s first shares.
      </h1>
      <p className="muted" style={{ maxWidth: '38rem', fontSize: '1.06rem', lineHeight: 1.65, margin: 0 }}>
        Every Friday an agent buys {kid} a little of real companies, with her own wallet, by the rule her parent set.
        Not a savings account with a stock picture on it — she owns the slices.
      </p>

      <section
        style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', margin: '2.5rem 0' }}
        data-testid="garden"
      >
        {(p?.holdings ?? []).map(h => {
          const split = state!.rule.split[h.symbol];
          const weeks = fridaysToWhole(h.shares, state!.rule.weeklyUsd, split, h.price);
          return (
            <article key={h.symbol} className="card" data-testid="plant" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Plant progress={h.shares} color={h.color} />
              <h2 className="display" style={{ fontSize: '1.55rem', margin: '0.5rem 0 0.15rem' }}>{h.name}</h2>
              <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>{h.blurb}</p>
              <p style={{ margin: '0.9rem 0 0.2rem', fontWeight: 600 }}>{kid} owns {shareWords(h.shares)}</p>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                {h.shares.toFixed(6)} {h.ticker} · worth {usd(h.valueUsd)}
              </p>
              <div className="bar" style={{ width: '100%', margin: '1rem 0 0.5rem' }}>
                <span style={{ width: `${Math.max(1.5, Math.min(100, h.shares * 100))}%`, background: h.color }} />
              </div>
              <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                {weeks === null
                  ? 'Not in the plan right now.'
                  : weeks === 0
                    ? 'A whole share!'
                    : `${weeks} more Fridays to a whole share`}
              </p>
            </article>
          );
        })}
        {!p && [0, 1, 2].map(i => <div key={i} className="card" style={{ height: '26rem', opacity: 0.4 }} />)}
      </section>

      <section style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))' }}>
        <div className="card">
          <p className="eyebrow">In the jar</p>
          <p className="display" style={{ fontSize: '2.4rem', margin: '0.35rem 0', color: 'var(--gold)' }} data-testid="cash">
            {p ? usd(p.cashUsd) : '—'}
          </p>
          <p className="muted" style={{ margin: '0 0 1.2rem', fontSize: '0.9rem', lineHeight: 1.55 }}>
            {state?.ruleText}
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Link className="btn" href="/friday">It&apos;s Friday — run the plan</Link>
            <Link className="btn ghost" href="/parent">Change the rule</Link>
          </div>
        </div>
        <div className="card">
          <p className="eyebrow">Fridays so far</p>
          {(state?.runs ?? []).filter(r => r.buys.length).slice(0, 4).map(r => (
            <div key={r.id} style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--line)' }}>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>{new Date(r.at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
              <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
                {r.buys.map(b => `${usd(b.usd)} ${b.symbol.replace('fs', '')}`).join(' · ')}
                {r.skips.length ? ` · skipped ${r.skips.length}` : ''}
              </p>
            </div>
          ))}
          {!state?.runs.some(r => r.buys.length) && <p className="muted" style={{ fontSize: '0.9rem' }}>No Fridays yet.</p>}
          {p && (
            <p style={{ margin: '1rem 0 0' }}>
              <a className="tx" href={addressUrl(p.address)} target="_blank" rel="noreferrer">
                {kid}&apos;s wallet on BaseScan ↗
              </a>
            </p>
          )}
        </div>
      </section>

      <p className="muted" style={{ fontSize: '0.78rem', marginTop: '2rem', lineHeight: 1.6 }}>
        Base Sepolia testnet. The stocks are tokenized stand-ins (fsAAPL, fsNVDA, fsVOO) traded on real Uniswap v4 pools,
        priced from real market quotes — not securities, and not real money.
      </p>
    </div>
  );
}
