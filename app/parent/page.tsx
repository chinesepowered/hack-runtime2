'use client';

import { useEffect, useState } from 'react';
import { usd, useFirstShare } from '@/components/useFirstShare';
import { STOCKS, type StockSymbol } from '@/lib/chain';
import { describeRule, type Rule } from '@/lib/rules';

export default function ParentPage() {
  const { state, reload } = useFirstShare();
  const [rule, setRule] = useState<Rule | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state && !rule) setRule(state.rule);
  }, [state, rule]);

  if (!rule) return <div className="page">Loading…</div>;

  const total = STOCKS.reduce((s, x) => s + rule.split[x.symbol], 0);
  const setSplit = (symbol: StockSymbol, v: number) => setRule({ ...rule, split: { ...rule.split, [symbol]: v } });

  async function save() {
    setBusy(true);
    const res = await fetch('/api/rule', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rule) });
    const body = await res.json();
    setBusy(false);
    setMessage(res.ok ? 'Saved. The agent will follow this from now on.' : body.error);
    if (res.ok) void reload();
  }

  async function deposit(amount: number) {
    setBusy(true);
    setMessage('Adding to the jar…');
    const res = await fetch('/api/deposit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usd: amount }) });
    const body = await res.json();
    setBusy(false);
    setMessage(res.ok ? `Added ${usd(amount)} in test dollars.` : body.error);
    if (res.ok) void reload();
  }

  return (
    <div className="page" style={{ maxWidth: '46rem' }}>
      <p className="eyebrow">For the grown-up</p>
      <h1 className="display" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', margin: '0.5rem 0 1.5rem' }}>The rule.</h1>

      <div className="card">
        <label className="field">
          <span>Kid&apos;s name</span>
          <input type="text" value={rule.kidName} onChange={e => setRule({ ...rule, kidName: e.target.value })} />
        </label>
        <label className="field">
          <span>Every Friday, invest <b>{usd(rule.weeklyUsd)}</b></span>
          <input type="range" min={1} max={50} value={rule.weeklyUsd} onChange={e => setRule({ ...rule, weeklyUsd: Number(e.target.value) })} />
        </label>
        {STOCKS.map(s => (
          <label key={s.symbol} className="field">
            <span>{s.name} <b>{rule.split[s.symbol]}%</b></span>
            <input type="range" min={0} max={100} step={5} value={rule.split[s.symbol]} onChange={e => setSplit(s.symbol, Number(e.target.value))} />
          </label>
        ))}
        <p style={{ fontSize: '0.82rem', margin: '-0.5rem 0 1.25rem', color: total === 100 ? 'var(--green)' : 'var(--coral)' }}>
          Split adds up to {total}%{total === 100 ? '' : ' — it needs to be 100%'}
        </p>
        <label className="field">
          <span><span>Skip a stock that jumped more than <b>{rule.skipIfUpPct}%</b> that week</span></span>
          <input type="range" min={1} max={20} step={0.5} value={rule.skipIfUpPct} onChange={e => setRule({ ...rule, skipIfUpPct: Number(e.target.value) })} />
        </label>
        <p className="display" style={{ fontSize: '1.15rem', lineHeight: 1.5, margin: '0.5rem 0 1.25rem' }}>&ldquo;{describeRule(rule)}&rdquo;</p>
        <button className="btn" onClick={save} disabled={busy || total !== 100}>Save the rule</button>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <p className="eyebrow">Add to the jar</p>
        <p className="muted" style={{ fontSize: '0.88rem', lineHeight: 1.55 }}>
          On testnet, this mints test dollars (fsUSD) to {rule.kidName}&apos;s wallet. In real life it would be a USDC transfer from you.
          The jar currently holds {state?.portfolio ? usd(state.portfolio.cashUsd) : '—'}.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {[10, 25, 50].map(v => (
            <button key={v} className="btn ghost" onClick={() => deposit(v)} disabled={busy || !state?.live.canDeposit}>+ {usd(v)}</button>
          ))}
        </div>
      </div>

      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}
    </div>
  );
}
