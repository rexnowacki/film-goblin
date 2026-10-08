"use client";

import { useRouter } from "next/navigation";
import { dismissFilmRequest, fulfillFilmRequest } from "@/lib/actions/film-requests";

interface Request {
  id: string;
  title: string;
  needs_itunes_id: boolean;
}

export default function FilmRequestActions({ request }: { request: Request }) {
  const router = useRouter();

  async function handleDirectAdd() {
    const res = await fulfillFilmRequest(request.id);
    if (res.ok) {
      router.refresh();
    } else {
      alert(`Failed: ${res.error}`);
    }
  }

  async function handleDismiss() {
    const res = await dismissFilmRequest(request.id);
    if (res.ok) {
      router.refresh();
    } else {
      alert(`Failed: ${res.error}`);
    }
  }

  const dismiss = (
    <button
      className="btn btn-sm btn-outline"
      style={{ fontSize: 12, whiteSpace: "nowrap" }}
      onClick={handleDismiss}
    >
        Dismiss
    </button>
  );

  if (request.needs_itunes_id) {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <a
          href={`/admin/films/new?request_id=${request.id}`}
          className="btn btn-sm btn-outline"
          style={{ fontSize: 12, whiteSpace: "nowrap" }}
        >
          Review & Add
        </a>
        {dismiss}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        className="btn btn-sm"
        style={{ fontSize: 12, whiteSpace: "nowrap" }}
        onClick={handleDirectAdd}
      >
        Add to catalog
      </button>
      {dismiss}
    </div>
  );
}
