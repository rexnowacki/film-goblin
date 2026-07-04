interface PriceHistoryRow {
  price_usd: number | string;
  captured_at: string;
}

interface Props {
  history: PriceHistoryRow[];
}

function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatMonth(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toLowerCase();
}

export default function PriceStatBlock({ history }: Props) {
  if (history.length === 0) return null;

  const numeric = history.map(h => ({
    price: Number(h.price_usd),
    captured_at: h.captured_at,
  }));

  const now = numeric[numeric.length - 1];
  const peak = numeric.reduce((a, b) => (b.price > a.price ? b : a));
  const steal = numeric.reduce((a, b) => (b.price < a.price ? b : a));

  const hasRange = peak.price !== steal.price;

  return (
    <div className={`price-stat-block${hasRange ? "" : " price-stat-solo"}`}>
      <div className="price-stat-now">
        <div className="price-stat-label price-stat-label-now">NOW:</div>
        <div className="price-stat-now-price">{formatPrice(now.price)}</div>
      </div>
      {hasRange && (
        <div className="price-stat-history">
          <div className="price-stat-peak">
            <div className="price-stat-label price-stat-label-history">HIGHEST PRICE:</div>
            <div className="price-stat-history-price">{formatPrice(peak.price)}</div>
            <div className="price-stat-date">{formatMonth(peak.captured_at)}</div>
          </div>
          <div className="price-stat-steal">
            <div className="price-stat-label price-stat-label-history">LOWEST PRICE:</div>
            <div className="price-stat-history-price">{formatPrice(steal.price)}</div>
            <div className="price-stat-date">{formatMonth(steal.captured_at)}</div>
          </div>
        </div>
      )}
      {hasRange && numeric.length >= 3 && <PriceSparkline points={numeric} />}
    </div>
  );
}

/* Subordinate accent strip under the stat split — the split block stays the
 * primary display (it deliberately replaced the old full inline chart; see
 * the header comment in 10-price-stat.css). Stepped shape because prices
 * hold flat between captures. */
function PriceSparkline({ points }: { points: { price: number }[] }) {
  const W = 400;
  const H = 48;
  const PAD = 5;
  const min = Math.min(...points.map(p => p.price));
  const max = Math.max(...points.map(p => p.price));
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (price: number) => PAD + (1 - (price - min) / (max - min)) * (H - PAD * 2);
  let d = `M 0 ${y(points[0].price).toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H ${x(i).toFixed(2)} V ${y(points[i].price).toFixed(2)}`;
  }
  return (
    <div className="price-stat-spark" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
