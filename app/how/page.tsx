import { addressUrl, D, STOCKS } from '@/lib/chain';
import { canDeposit } from '@/lib/deposit';
import { MAX_POOL_DRIFT } from '@/lib/rules';
import { canSign, kidAddress } from '@/lib/signer';

export const dynamic = 'force-dynamic';

const STEPS = [
  { n: '1', title: 'The rule', body: 'A parent sets how much, how to split it, and when to hold off. Code applies it; no model decides how a child’s money is spent.', tech: 'lib/rules.ts' },
  { n: '2', title: 'The market', body: 'The agent reads each real stock’s price and its week, and skips anything that jumped past the parent’s limit.', tech: 'Yahoo Finance · lib/prices.ts' },
  { n: '3', title: 'The pool', body: `It prices every buy against the Uniswap v4 pool and refuses if the pool is more than ${MAX_POOL_DRIFT * 100}% from the market.`, tech: 'V4Quoter · StateView' },
  { n: '4', title: 'The buy', body: 'The kid’s own Dynamic wallet signs a swap through the Universal Router, and the shares land in her wallet.', tech: 'Dynamic server wallet · UniversalRouter V4_SWAP' },
];

export default function HowPage() {
  const kid = kidAddress();
  const rows = [
    { what: 'Market prices', live: true, text: 'Live — Yahoo Finance, last close' },
    { what: 'Uniswap v4 pools', live: true, text: 'Live — Base Sepolia, seeded at the real close' },
    { what: 'Kid wallet signing', live: canSign(), text: canSign() ? 'Live — Dynamic server wallet' : 'Unavailable on this server' },
    { what: 'Parent deposits', live: canDeposit(), text: canDeposit() ? 'Test dollars minted on testnet' : 'Unavailable' },
  ];

  return (
    <div className="page">
      <p className="eyebrow">How it works</p>
      <h1 className="display" style={{ fontSize: 'clamp(2rem, 5vw, 3.1rem)', margin: '0.5rem 0 0.75rem' }}>An agent with an allowance.</h1>
      <p className="muted" style={{ maxWidth: '40rem', lineHeight: 1.65, marginBottom: '2.5rem' }}>
        The agent can only do one kind of thing: buy the stocks in the rule, with the money in the jar, at a fair price.
        Everything it decides is shown, and every trade is on-chain.
      </p>

      <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 2.5rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))' }}>
        {STEPS.map(s => (
          <li key={s.n} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <span className="display" style={{ fontSize: '2.1rem', color: 'var(--gold)', lineHeight: 1 }}>{s.n}</span>
            <h2 className="display" style={{ fontSize: '1.4rem', margin: 0 }}>{s.title}</h2>
            <p style={{ margin: 0, lineHeight: 1.55, flex: 1 }}>{s.body}</p>
            <p className="mono" style={{ margin: 0, color: 'var(--green)' }}>{s.tech}</p>
          </li>
        ))}
      </ol>

      <h2 className="display" style={{ fontSize: '1.5rem', margin: '0 0 1rem' }}>What is live in this build</h2>
      <div className="card" style={{ padding: 0, marginBottom: '2.5rem' }}>
        {rows.map((r, i) => (
          <div key={r.what} data-testid="status-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.95rem 1.25rem', borderTop: i ? '1px solid var(--line)' : 'none', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{r.what}</span>
            <span className="badge" data-live={r.live}><span className="dot" />{r.text}</span>
          </div>
        ))}
      </div>

      <h2 className="display" style={{ fontSize: '1.5rem', margin: '0 0 1rem' }}>On-chain</h2>
      <div className="card" style={{ display: 'grid', gap: '0.55rem', fontSize: '0.88rem' }}>
        {kid && <div>Kid wallet (Dynamic): <a className="tx" href={addressUrl(kid)} target="_blank" rel="noreferrer">{kid}</a></div>}
        <div>Universal Router: <a className="tx" href={addressUrl(D.v4.universalRouter)} target="_blank" rel="noreferrer">{D.v4.universalRouter}</a></div>
        <div>PoolManager: <a className="tx" href={addressUrl(D.v4.poolManager)} target="_blank" rel="noreferrer">{D.v4.poolManager}</a></div>
        {STOCKS.map(s => (
          <div key={s.symbol}>
            {s.symbol} (stands in for {s.ticker}): <a className="tx" href={addressUrl(D.tokens[s.symbol].address)} target="_blank" rel="noreferrer">{D.tokens[s.symbol].address}</a>
            <span className="muted"> · pool {D.pools[s.symbol].poolId.slice(0, 10)}…</span>
          </div>
        ))}
        <p className="muted" style={{ margin: '0.6rem 0 0', fontSize: '0.8rem' }}>
          Base Sepolia testnet. fsAAPL, fsNVDA and fsVOO are test tokens standing in for tokenized stocks, and fsUSD is test money. None are securities.
        </p>
      </div>
    </div>
  );
}
