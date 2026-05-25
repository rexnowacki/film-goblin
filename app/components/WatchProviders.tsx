import Image from "next/image";
import type { FilmWatchProvider } from "@/lib/queries/streaming-availability";

const CATEGORY_LABELS: Record<FilmWatchProvider["category"], string> = {
  flatrate: "Streaming",
  free: "Free",
  ads: "With ads",
  rent: "Rent",
  buy: "Buy",
};

function ProviderPill({ provider }: { provider: FilmWatchProvider }) {
  const body = (
    <span
      style={{
        display: "inline-grid",
        gridTemplateColumns: provider.provider_logo_url ? "28px auto" : "auto",
        alignItems: "center",
        gap: 8,
        minHeight: 34,
        maxWidth: "100%",
        border: "1px solid rgba(245, 239, 220, 0.22)",
        background: "rgba(245, 239, 220, 0.06)",
        color: "var(--bone)",
        padding: provider.provider_logo_url ? "3px 10px 3px 4px" : "7px 10px",
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        fontWeight: 700,
        textDecoration: "none",
      }}
    >
      {provider.provider_logo_url && (
        <span
          style={{
            position: "relative",
            width: 28,
            height: 28,
            overflow: "hidden",
            background: "var(--void)",
          }}
        >
          <Image
            src={provider.provider_logo_url}
            alt=""
            fill
            sizes="28px"
            style={{ objectFit: "cover" }}
          />
        </span>
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {provider.provider_name}
      </span>
    </span>
  );

  if (!provider.tmdb_link) return body;
  return (
    <a href={provider.tmdb_link} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none", minWidth: 0 }}>
      {body}
    </a>
  );
}

function ProviderGroup({ label, providers }: { label: string; providers: FilmWatchProvider[] }) {
  if (providers.length === 0) return null;
  return (
    <div>
      <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {providers.map((provider) => (
          <ProviderPill key={`${provider.category}:${provider.provider_id}`} provider={provider} />
        ))}
      </div>
    </div>
  );
}

export default function WatchProviders({ providers }: { providers: FilmWatchProvider[] }) {
  if (providers.length === 0) return null;

  const providersByCategory = providers.reduce<Record<string, FilmWatchProvider[]>>((groups, provider) => {
    groups[provider.category] = [...(groups[provider.category] ?? []), provider];
    return groups;
  }, {});

  return (
    <section style={{ width: "100%", maxWidth: 760, marginTop: 30 }}>
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12 }}>
        Streaming On
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        {(["flatrate", "free", "ads"] as const).map((category) => (
          <ProviderGroup
            key={category}
            label={CATEGORY_LABELS[category]}
            providers={providersByCategory[category] ?? []}
          />
        ))}
      </div>
      <div style={{ marginTop: 10, fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--muted)" }}>
        Availability data from TMDB.
      </div>
    </section>
  );
}
