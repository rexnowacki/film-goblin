"use client";

import { useState } from "react";

type Tab = "all" | "reviews" | "recs" | "lists";

export default function FeedTabs<T extends { kind: string }>({ items }: { items: T[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const filtered = items.filter(i => {
    if (tab === "all") return true;
    if (tab === "reviews") return i.kind === "review_published";
    if (tab === "recs") return i.kind === "recommendation_sent";
    if (tab === "lists") return i.kind === "list_created" || i.kind === "list_film_added";
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["all", "reviews", "recs", "lists"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className="caps" style={{
            background: tab === t ? "var(--accent)" : "transparent",
            color: tab === t ? "var(--accent-ink)" : "var(--muted)",
            border: "1px solid " + (tab === t ? "var(--accent)" : "#333"),
            padding: "6px 12px", fontSize: 10, cursor: "pointer",
            fontFamily: "var(--font-ui)", fontWeight: 700,
          }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        {filtered.length === 0 ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
            No activity yet. Follow someone to see their feed.
          </div>
        ) : (
          filtered.map((item, i) => (
            <div key={i} style={{ borderBottom: "1px solid #2a2a2a", paddingBottom: 12 }}>
              <div className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>{item.kind}</div>
              <pre style={{ fontSize: 12, color: "var(--bone)", whiteSpace: "pre-wrap" }}>{JSON.stringify(item, null, 2)}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
