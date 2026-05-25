"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { recommendFilm } from "@/lib/actions/recommendations";
import { useToast } from "../ToastProvider";
import BottomSheet from "../BottomSheet";
import Avatar from "../ui/Avatar";
import { filterCovenMembers } from "../recommend-modal-search";

interface CovenMember {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  filmId: string;
  filmTitle: string;
  covenMembers: CovenMember[];
  topCovenMemberIds: string[];
}

export default function RecommendModal({ filmId, filmTitle, covenMembers, topCovenMemberIds }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  // Auto-open from URL param: PosterQuickAdd's mobile sheet links here with
  // ?recommend=1 so the user lands directly inside the recommend flow.
  // Strips the param after open so a back-nav doesn't re-trigger.
  useEffect(() => {
    if (params?.get("recommend") === "1") {
      setOpen(true);
      const next = new URLSearchParams(params.toString());
      next.delete("recommend");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [params, pathname, router]);

  // Sort the full coven list with topCovenMemberIds first (in their existing
  // order — already ranked by recommendation count desc), then everyone else
  // alphabetically by username. Surfaces likely picks without dedicated UI.
  const sortedMembers = useMemo(() => {
    const topRank = new Map(topCovenMemberIds.map((id, i) => [id, i]));
    return [...covenMembers].sort((a, b) => {
      const aRank = topRank.get(a.id);
      const bRank = topRank.get(b.id);
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;
      return a.username.localeCompare(b.username);
    });
  }, [covenMembers, topCovenMemberIds]);

  const visibleMembers = useMemo(() => {
    if (search.trim().length === 0) return sortedMembers;
    return filterCovenMembers(sortedMembers, search);
  }, [sortedMembers, search]);

  function close() {
    setOpen(false);
    setSelectedUserId(null);
    setSearch("");
    setSent(false);
    setError(null);
    setNote("");
  }

  function pick(id: string) {
    setSelectedUserId(prev => (prev === id ? null : id));
  }

  function send() {
    if (!selectedUserId) return;
    start(async () => {
      setError(null);
      try {
        await recommendFilm(filmId, selectedUserId, note);
        setSent(true);
        toast("Recommendation sent");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      }
    });
  }

  if (!open) {
    return <button className="btn btn-lg" onClick={() => setOpen(true)}>✦ Recommend To A Coven Member</button>;
  }

  const title = (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span>Cast the Rune</span>
      <span className="dot-accent">•</span>
      <span style={{ fontSize: 18, color: "var(--muted)", fontFamily: "var(--font-ui)", fontWeight: 400 }}>
        {filmTitle}
      </span>
    </span>
  );

  return (
    <BottomSheet open={open} onClose={close} title={title}>
      {covenMembers.length === 0 ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.5, padding: "12px 0" }}>
          You have no coven yet. Visit <a href="/coven" style={{ color: "var(--accent)", textDecoration: "underline" }}>/coven</a> to bind with someone, then come back.
        </div>
      ) : sent ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", padding: "12px 0" }}>
          Sent. They&rsquo;ll see it in their feed.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "70dvh", padding: "8px 0 0" }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search covenfolk…"
            className="recommend-picker-search"
            style={{ flexShrink: 0, marginBottom: 12 }}
          />

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", marginBottom: 12 }}>
            {visibleMembers.length > 0 ? (
              <div className="recommend-picker-list">
                {visibleMembers.map(m => {
                  const selected = m.id === selectedUserId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pick(m.id)}
                      className={`recommend-picker-row ${selected ? "is-selected" : ""}`}
                      aria-pressed={selected}
                    >
                      <Avatar
                        name={m.username}
                        color="var(--accent)"
                        size={36}
                        url={m.avatar_url}
                      />
                      <span className="recommend-picker-row-text">
                        <span className="recommend-picker-row-username">{m.username}</span>
                        {m.display_name && (
                          <span className="recommend-picker-row-display">{m.display_name}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", padding: "4px 0" }}>
                No covenfolk match.
              </div>
            )}
          </div>

          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid var(--muted)",
              paddingTop: 12,
              paddingBottom: "env(keyboard-inset-height, 0px)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="a whisper… (watch this with the lights off)"
              style={{
                width: "100%",
                border: "1px solid var(--muted)",
                background: "transparent",
                color: "var(--bone)",
                padding: 10,
                fontFamily: "var(--font-serif)",
                fontSize: 14,
                resize: "none",
                outline: "none",
              }}
            />

            {error && (
              <div style={{ color: "var(--danger)", fontStyle: "italic", fontSize: 13 }}>{error}</div>
            )}

            <button
              type="button"
              disabled={pending || !selectedUserId}
              onClick={send}
              className="btn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {pending ? "Sealing…" : "✦ Seal & Send"}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
