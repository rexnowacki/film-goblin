import TasteTwinCard from "./TasteTwinCard";
import type { TasteTwinSuggestion } from "@/lib/queries/taste-twins";
export default function TasteTwinStrip({ suggestions }: { suggestions: TasteTwinSuggestion[] }) {
  if (!suggestions.length) return null;
  const hasTasteEvidence = suggestions.some(suggestion => suggestion.source === "taste");
  return <section className="taste-twin-strip"><div className="eyebrow">{hasTasteEvidence ? "Kindred signals" : "Coven paths"}</div><h2>{hasTasteEvidence ? "People whose film trail crosses yours." : "People your coven knows."}</h2><div className="taste-twin-strip__rail">{suggestions.map(s => <TasteTwinCard key={s.user.id} suggestion={s} />)}</div></section>;
}
