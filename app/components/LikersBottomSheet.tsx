"use client";

import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";
import Avatar from "./Avatar";
import { fetchLikersForActivity, type LikersResponse } from "@/lib/actions/reactions";

interface Props {
  activityId: string;
  open: boolean;
  onClose: () => void;
}

interface LikerRowProps {
  p: { id: string; username: string; display_name: string | null; avatar_url: string | null };
}

function LikerRow({ p }: LikerRowProps) {
  return (
    <a href={`/p/${p.username}`} className="liker-row">
      <Avatar
        name={p.display_name || p.username}
        url={p.avatar_url}
        size={36}
      />
      <div className="liker-row-text">
        <div className="liker-row-name">{p.display_name || p.username}</div>
        <div className="liker-row-handle">@{p.username}</div>
      </div>
    </a>
  );
}

export default function LikersBottomSheet({ activityId, open, onClose }: Props) {
  const [data, setData] = useState<LikersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lazy-load on first open only. Sheet can be opened / closed / reopened
  // without re-fetching during the same session.
  useEffect(() => {
    if (!open || data != null || loading) return;
    setLoading(true);
    setErr(null);
    fetchLikersForActivity(activityId)
      .then(setData)
      .catch(e => setErr(e instanceof Error ? e.message : "Couldn't load likers."))
      .finally(() => setLoading(false));
  }, [open, activityId, data, loading]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Liked by">
      {loading && <div className="likers-loading">Loading…</div>}
      {err && <div className="likers-error">{err}</div>}
      {data && (
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
