"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export default function PeopleSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [, start] = useTransition();

  function update(next: string) {
    setQ(next);
    start(() => {
      const p = new URLSearchParams(params);
      if (next) p.set("q", next); else p.delete("q");
      router.push(`/coven?${p.toString()}`);
    });
  }

  return (
    <input
      value={q}
      onChange={e => update(e.target.value)}
      placeholder="Username or display name…"
      style={{ flex: 1, background: "transparent", border: 0, fontFamily: "var(--font-serif)", fontSize: 20, padding: "12px 8px", color: "var(--void)", outline: "none" }}
    />
  );
}
