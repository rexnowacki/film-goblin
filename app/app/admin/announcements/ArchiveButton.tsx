"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminArchiveAnnouncement } from "@/lib/actions/admin/announcements";

interface Props {
  announcementId: string;
  title: string;
}

export default function ArchiveButton({ announcementId, title }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Escape cancels the pending confirm (matches BottomSheet UX). Only attached
  // while the confirm UI is visible; cleaned up when collapsed.
  useEffect(() => {
    if (!confirming) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirming(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  function archive() {
    setErr(null);
    startTransition(async () => {
      const res = await adminArchiveAnnouncement(announcementId);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-outline"
        onClick={() => setConfirming(true)}
      >
        Archive
      </button>
    );
  }

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 12, fontStyle: "italic" }}>
        Archive &ldquo;{title}&rdquo;?
      </span>
      <button
        type="button"
        className="btn btn-sm"
        onClick={archive}
        disabled={isPending}
        style={{ background: "var(--danger)", color: "var(--bone)" }}
      >
        {isPending ? "Archiving…" : "Confirm"}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline"
        onClick={() => setConfirming(false)}
        disabled={isPending}
      >
        Cancel
      </button>
      {err && <span style={{ color: "var(--danger)", fontSize: 12 }}>{err}</span>}
    </div>
  );
}
