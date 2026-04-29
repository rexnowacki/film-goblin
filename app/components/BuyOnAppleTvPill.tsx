interface Props {
  url: string;
  price: number | null;
}

export default function BuyOnAppleTvPill({ url, price }: Props) {
  const label = price != null ? `$${price.toFixed(2)}` : "Apple TV";
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="buy-on-apple-tv-pill caps"
      aria-label={`Buy on Apple TV${price != null ? ` for $${price.toFixed(2)}` : ""}`}
    >
      {label} →
    </a>
  );
}
