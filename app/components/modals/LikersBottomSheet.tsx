"use client";

import { useEffect, useState } from "react";
import BottomSheet from "../BottomSheet";
import Avatar from "../ui/Avatar";
import type { LikersResponse } from "@/lib/actions/reactions";

interface Props {
  /** Stable identifier; switching it forces a re-fetch. */
  cacheKey: string;
  fetcher: () => Promise<LikersResponse>;
  open: boolean;
  onClose: () => void;
  title?: string;
}

interface LikerRowProps {
  p: { id: string; username: string; display_name: string | null; avatar_url: string | null };
}

function LikerRow({ p }: LikerRowProps) {
  return (
    <a href={`/p/${p.username}`} className="liker-row">
      <Avatar
        name={p.username}
        url={p.avatar_url}
        size={36}
      />
      <div className="liker-row-text">
        <div className="liker-row-name">{p.username}</div>
        <div className="liker-row-handle">@{p.username}</div>
      </div>
    </a>
  );
}

export default function LikersBottomSheet({ cacheKey, fetcher, open, onClose, title = "Liked by" }: Props) {
  const [data, setData] = useState<LikersResponse | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lazy-load on first open per cacheKey. Re-fetches if the key changes
  // (e.g. opening the sheet on a different comment).
  useEffect(() => {
    if (!open) return;
    if (loadedKey === cacheKey || loading) return;
    setLoading(true);
    setErr(null);
    fetcher()
      .then(d => { setData(d); setLoadedKey(cacheKey); })
      .catch(e => setErr(e instanceof Error ? e.message : "Couldn't load likers."))
      .finally(() => setLoading(false));
  }, [open, cacheKey, loadedKey, loading, fetcher]);

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {loading && <div className="likers-loading">Loading…</div>}
      {err && <div className="likers-error">{err}</div>}
      {data && loadedKey === cacheKey && (
        <>
          {data.coven.length > 0 && (
            <section className="likers-section">
              <div className="eyebrow likers-section-label">Your coven</div>
              {data.coven.map(p => <LikerRow key={p.id} p={p} />)}
            </section>
          )}
          {data.others.length > 0 && (
            <section className="likers-section">
              <div className="likers-divider" aria-hidden="true" />
              <div className="eyebrow likers-section-label">Others</div>
              {data.others.map(p => <LikerRow key={p.id} p={p} />)}
            </section>
          )}
          {data.coven.length === 0 && data.others.length === 0 && (
            <div className="likers-empty">No one you can see.</div>
          )}
        </>
      )}
    </BottomSheet>
  );
}
