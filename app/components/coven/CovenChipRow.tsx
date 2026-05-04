"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import LeaveCovenButton from "@/components/LeaveCovenButton";
import CovenSeeAllSheet from "@/components/coven/CovenSeeAllSheet";
import { filterCovenMembers } from "@/components/recommend-modal-search";
import type { CovenfolkRanked } from "@/lib/queries/coven-interactions";

const TOP_CHIP_COUNT = 4;

interface Props {
  members: CovenfolkRanked[];
}

export default function CovenChipRow({ members }: Props) {
  const [query, setQuery] = useState("");
  const [seeAllOpen, setSeeAllOpen] = useState(false);

  if (members.length === 0) {
    return (
      <>
        <h2 className="eyebrow" style={{ fontSize: 14, color: "var(--accent)", margin: "0 0 16px" }}>Your Coven</h2>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
          Your coven is empty. Search to your right to find souls to bind with.
        </div>
      </>
    );
  }

  const topChips = members.slice(0, TOP_CHIP_COUNT);
  const showSeeAll = members.length > TOP_CHIP_COUNT;
  const showSearch = members.length >= 12;
  const filtered = query.trim() ? filterCovenMembers(members, query) : [];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, gap: 12 }}>
        <h2 className="eyebrow" style={{ fontSize: 14, color: "var(--accent)", margin: 0 }}>
          Your Coven {members.length > 1 && <span style={{ color: "var(--muted)", fontWeight: "normal" }}>({members.length})</span>}
        </h2>
        {showSeeAll && (
          <button
            type="button"
            onClick={() => setSeeAllOpen(true)}
            style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--accent)", background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 }}
          >
            View all ({members.length})
          </button>
        )}
      </div>

      {showSearch && (
        <>
          <div className="search-pill">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
            <input
              type="search"
              name="coven-search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="Search your coven"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search your coven…"
            />
          </div>
          {query.trim() && (
            filtered.length === 0 ? (
              <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, fontSize: 14, marginBottom: 16 }}>
                No covenfolk match.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                {filtered.map(m => <CovenCompactRow key={m.id} member={m} />)}
              </div>
            )
          )}
        </>
      )}

      <div className="coven-chip-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {topChips.map(m => (
          <Link key={m.id} href={`/p/${encodeURIComponent(m.username)}`} className="coven-chip">
            <Avatar name={m.username} color="var(--accent)" size={28} url={m.avatar_url} />
            <span>{m.username}</span>
          </Link>
        ))}
      </div>

      <CovenSeeAllSheet open={seeAllOpen} onClose={() => setSeeAllOpen(false)} members={members} />
    </>
  );
}

export function CovenCompactRow({ member }: { member: CovenfolkRanked }) {
  return (
    <div className="pill-row">
      <Avatar name={member.username} color="var(--accent)" size={32} url={member.avatar_url} />
      <Link
        href={`/p/${encodeURIComponent(member.username)}`}
        style={{ flex: 1, color: "var(--bone)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 14 }}
      >
        {member.username}
      </Link>
      <LeaveCovenButton
        otherUserId={member.id}
        otherUsername={member.username}
        otherDisplayName={member.username}
      />
    </div>
  );
}
