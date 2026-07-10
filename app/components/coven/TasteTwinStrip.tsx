import TasteTwinCard from "./TasteTwinCard";
import type { TasteTwinSuggestion } from "@/lib/queries/taste-twins";
export default function TasteTwinStrip({ suggestions }: { suggestions: TasteTwinSuggestion[] }) {
  if (!suggestions.length) return null;
  return <section className="taste-twin-strip"><div className="eyebrow">Kindred signals</div><h2>People whose film trail crosses yours.</h2><div className="taste-twin-strip__rail">{suggestions.map(s => <TasteTwinCard key={s.user.id} suggestion={s} />)}</div></section>;
}
