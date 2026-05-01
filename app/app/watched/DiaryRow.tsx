"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import WatchModal from "@/components/WatchModal";
import { editWatch, deleteWatch } from "@/lib/actions/watched";
import { useToast } from "@/components/ToastProvider";
import type { DiaryRow as DiaryRowData } from "@/lib/queries/watched";

interface Props {
  row: DiaryRowData;
}

export default function DiaryRow({ row }: Props) {
  const { toast } = useToast();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  // Open the modal when ?rate=<this row's id> appears, even on a soft-nav
  // that doesn't remount the component (bell-row tap from /watched itself).
  // Re-fires only on URL change; closing via setOpen(false) sticks until
  // the user clicks the row or the URL changes again.
  useEffect(() => {
    if (params?.get("rate") === row.id) setOpen(true);
  }, [params, row.id]);

  async function save({ watched_at, note, recommended }: { watched_at: string; note: string; recommended: boolean | null }) {
    await editWatch(row.id, { watched_at, note: note || null, recommended });
    toast("Watch updated");
  }

  async function del() {
    await deleteWatch(row.id);
    toast("Watch removed");
  }

  return (
    <>
      <div
        className="diary-row"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter") setOpen(true); }}
      >
        <Link
          href={`/film/${row.film.id}`}
          onClick={e => e.stopPropagation()}
          style={{ flexShrink: 0 }}
        >
          <Image
            src={row.film.artwork_url}
            alt={row.film.title}
            width={50}
            height={75}
            style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }}
          />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="head" style={{ fontSize: 18, lineHeight: 1.1 }}>{row.film.title}</div>
          <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
            {row.film.year} · {row.watched_at.slice(8, 10)}
          </div>
          {row.note && (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginTop: 6, color: "var(--bone)", opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              &ldquo;{row.note}&rdquo;
            </div>
          )}
        </div>
      </div>
      {open && (
        <WatchModal
          open={open}
          mode="edit"
          initial={{ id: row.id, watched_at: row.watched_at, note: row.note ?? "", recommended: row.recommended ?? null }}
          filmTitle={row.film.title}
          onSave={save}
          onDelete={del}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
