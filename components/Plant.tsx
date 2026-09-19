/**
 * A plant that grows toward a whole share. `progress` is the fraction of one
 * share owned (0..1). The stem grows with the square root so a first $5 is
 * visible, not a speck — and the flower only opens at a whole share.
 */
export function Plant({ progress, color, size = 150 }: { progress: number; color: string; size?: number }) {
  const p = Math.max(0, Math.min(1, progress));
  const g = p > 0 ? 0.46 + 0.54 * Math.sqrt(p) : 0.2; // a first Friday already shows a real seedling
  const stemTop = 150 - 118 * g;
  const leaves = Math.max(1, Math.min(4, Math.ceil(g * 4)));
  const leafYs = Array.from({ length: leaves }, (_, i) => 150 - (118 * g * (i + 1)) / (leaves + 1));

  return (
    <svg viewBox="0 0 120 180" width={size} height={(size * 180) / 120} aria-hidden="true">
      {/* pot */}
      <path d="M26 150 h68 l-8 26 h-52 z" fill="#d9a07b" />
      <rect x="22" y="144" width="76" height="10" rx="3" fill="#c98c66" />
      <g className="sway">
        <g className="plant-grow">
          <path d={`M60 150 C 58 ${150 - 40 * g}, 62 ${stemTop + 30}, 60 ${stemTop}`} stroke="#3f7a57" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          {leafYs.map((y, i) => {
            const left = i % 2 === 0;
            const s = 0.75 + 0.35 * g;
            return (
              <path
                key={i}
                d={left ? `M60 ${y} q -22 -4 -26 -18 q 18 2 26 18` : `M60 ${y} q 22 -4 26 -18 q -18 2 -26 18`}
                fill="#4f9a6d"
                transform={`translate(${60 - 60 * s} ${y - y * s}) scale(${s})`}
              />
            );
          })}
          {p >= 1 ? (
            <g transform={`translate(60 ${stemTop})`}>
              {[0, 60, 120, 180, 240, 300].map(a => (
                <ellipse key={a} cx="0" cy="-9" rx="6" ry="10" fill={color} transform={`rotate(${a})`} />
              ))}
              <circle r="5" fill="#f2b632" />
            </g>
          ) : (
            <circle cx="60" cy={stemTop} r={4 + 5 * g} fill={color} opacity={0.35 + 0.65 * g} />
          )}
        </g>
      </g>
    </svg>
  );
}

export function Sprout({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M12 21v-8" stroke="#2f6b4f" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 13c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z" fill="#4f9a6d" />
      <path d="M12 14c0-3.2-2.4-5.2-5.6-5.2 0 3.2 2.4 5.2 5.6 5.2z" fill="#e8735a" />
    </svg>
  );
}
