"use client";

import { useState, useTransition } from "react";
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
        style={{ background: "var(--blood)", color: "var(--bone)" }}
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
      {err && <span style={{ color: "var(--blood)", fontSize: 12 }}>{err}</span>}
    </div>
  );
}
