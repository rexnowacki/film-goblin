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
    </div>
  );
}
