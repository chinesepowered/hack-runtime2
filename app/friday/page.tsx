'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usd, useFirstShare } from '@/components/useFirstShare';
import type { AgentEvent } from '@/lib/agent';

const ICON: Record<AgentEvent['type'], { bg: string; glyph: string }> = {
  start: { bg: '#23302a', glyph: '▶' },
  market: { bg: '#6d7a72', glyph: '$' },
  decide: { bg: '#c9962a', glyph: '?' },
  pool: { bg: '#ff4fa3', glyph: '◆' },
  guard: { bg: '#e8735a', glyph: '!' },
  approve: { bg: '#6d7a72', glyph: '✓' },
  swap: { bg: '#2f6b4f', glyph: '↻' },
  unavailable: { bg: '#e8735a', glyph: '!' },
  done: { bg: '#2f6b4f', glyph: '★' },
  error: { bg: '#b3261e', glyph: '×' },
};

function pctText(x: number) {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;
}

function Line({ e, kid }: { e: AgentEvent; kid: string }) {
  switch (e.type) {
    case 'start':
      return <p style={{ margin: 0 }}>{kid}&apos;s jar holds <b>{usd(e.cashUsd)}</b>. This week&apos;s plan: invest <b>{usd(e.weeklyUsd)}</b>.</p>;
    case 'market':
      return (
        <p style={{ margin: 0 }}>
          {e.name}: <b>${e.quote.price.toFixed(2)}</b> <span className="muted">· {pctText(e.quote.change5d)} this week ·{' '}
          {e.quote.source === 'yahoo' ? `market close ${new Date(e.quote.asOf).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'seed price (market data unavailable)'}</span>
        </p>
      );
    case 'decide':
      return <p style={{ margin: 0 }}><b>{e.action === 'buy' ? 'Buy' : 'Skip'}</b> — {e.reason}</p>;
    case 'pool':
      return (
        <p style={{ margin: 0 }}>
          Uniswap v4 pool for {e.name}: <b>${e.poolPrice.toFixed(2)}</b> <span className="muted">(market ${e.marketPrice.toFixed(2)}, {(e.drift * 100).toFixed(2)}% apart)</span>.
          Quote: <b>{e.shares.toFixed(6)}</b> shares at ${e.effectivePrice.toFixed(2)} each, fee included.
        </p>
      );
    case 'guard':
      return <p style={{ margin: 0 }}><b>Refused</b> — {e.reason}</p>;
    case 'approve':
      return <p style={{ margin: 0 }}>{e.label} <a className="tx" href={e.url} target="_blank" rel="noreferrer">tx ↗</a></p>;
    case 'swap':
      return (
        <p style={{ margin: 0 }}>
          {e.ok ? 'Bought' : 'Swap failed:'} <b>{e.shares.toFixed(6)} {e.name}</b> for {usd(e.usd)}, signed by {kid}&apos;s Dynamic wallet{' '}
          <a className="tx" href={e.url} target="_blank" rel="noreferrer">View on BaseScan ↗</a>
        </p>
      );
    case 'unavailable':
      return <p style={{ margin: 0 }}>{e.reason}</p>;
    case 'done':
      return (
        <p style={{ margin: 0 }}>
          Done. {e.bought} bought{e.skipped ? `, ${e.skipped} skipped` : ''} · {usd(e.spentUsd)} invested.
        </p>
      );
    case 'error':
      return <p style={{ margin: 0 }}>Something went wrong: {e.message}</p>;
  }
}

export default function FridayPage() {
  const { state, reload } = useFirstShare();
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const kid = state?.rule.kidName ?? 'Maya';

  async function run() {
    setEvents([]);
    setFinished(false);
    setRunning(true);
    try {
      const res = await fetch('/api/run', { method: 'POST' });
      if (!res.body || !res.ok) {
        const body = await res.json().catch(() => ({}));
        setEvents([{ type: 'error', message: body.error ?? `HTTP ${res.status}` }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) setEvents(prev => [...prev, JSON.parse(line) as AgentEvent]);
      }
    } finally {
      setRunning(false);
      setFinished(true);
      void reload();
    }
  }

  return (
    <div className="page" style={{ maxWidth: '52rem' }} data-busy={running}>
      <p className="eyebrow">Friday</p>
      <h1 className="display" style={{ fontSize: 'clamp(2.1rem, 5vw, 3.2rem)', margin: '0.5rem 0 0.8rem' }}>
        It&apos;s Friday.
      </h1>
      <p className="muted" style={{ fontSize: '1.02rem', lineHeight: 1.6, margin: '0 0 1.75rem' }}>{state?.ruleText}</p>

      {!state?.live.canSign && state && (
        <p className="badge" style={{ marginBottom: '1rem' }}>
          <span className="dot" /> Signing unavailable on this server — decisions only, no trades
        </p>
      )}

      <button className="btn big" onClick={run} disabled={running || !state} data-testid="run">
        {running ? 'The agent is working…' : events.length ? 'Run again' : `Run ${kid}'s plan`}
      </button>

      <section className="card" style={{ marginTop: '2rem', display: events.length ? 'grid' : 'none', gap: '1rem' }} data-testid="feed">
        {events.map((e, i) => (
          <div key={i} className="step" data-type={e.type}>
            <span className="icon" style={{ background: ICON[e.type].bg }}>{ICON[e.type].glyph}</span>
            <div style={{ paddingTop: '0.3rem', lineHeight: 1.55, fontSize: '0.95rem' }}>
              <Line e={e} kid={kid} />
            </div>
          </div>
        ))}
        {running && <p className="muted" style={{ margin: '0 0 0 2.75rem', fontSize: '0.85rem' }}>…</p>}
      </section>

      {finished && events.some(e => e.type === 'swap') && (
        <div style={{ marginTop: '1.5rem' }}>
          <Link className="btn" href="/" data-testid="see-garden">See {kid}&apos;s plants grow →</Link>
        </div>
      )}
    </div>
  );
}
