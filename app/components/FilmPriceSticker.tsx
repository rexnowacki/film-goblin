import { pickPriceBeat } from "@/lib/price-beat";

interface PriceHistoryRow {
  price_usd: number | string;
  captured_at: string;
}

interface Props {
  price: number;
  history: PriceHistoryRow[];
}

// Die-cut vinyl price sticker — same visual family as the OG share card
// (app/app/api/og/film/[id]/route.tsx), scaled down for the hero column.
// Informational only: the Buy button stays the sole CTA.
export default function FilmPriceSticker({ price, history }: Props) {
  const beat = pickPriceBeat(price, history);
  const beatText =
    beat.kind === "lowest"
      ? "lowest in 180 days"
      : beat.kind === "drop"
        ? `▼ down from $${beat.from.toFixed(2)}`
        : "on Apple TV";

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        background: "var(--accent)",
        color: "var(--void)",
        padding: "12px 20px",
        border: "3px solid var(--void)",
        borderRadius: 2,
        boxShadow: "6px 6px 0 var(--void)",
        transform: "rotate(-6deg)",
      }}
    >
      <div style={{ fontFamily: "var(--font-ui)", fontSize: 30, fontWeight: 800, lineHeight: 1 }}>
        ${price.toFixed(2)}
      </div>
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginTop: 6,
        }}
      >
        {beatText}
      </div>
    </div>
  );
}
