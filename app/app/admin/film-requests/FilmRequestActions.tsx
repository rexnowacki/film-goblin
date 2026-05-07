"use client";

import { useRouter } from "next/navigation";
import { fulfillFilmRequest } from "@/lib/actions/film-requests";

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

  if (request.needs_itunes_id) {
    return (
      <a
        href={`/admin/films/new?request_id=${request.id}`}
        className="btn btn-sm btn-outline"
        style={{ fontSize: 12, whiteSpace: "nowrap" }}
      >
        Review & Add
      </a>
    );
  }

  return (
    <button
      className="btn btn-sm"
      style={{ fontSize: 12, whiteSpace: "nowrap" }}
      onClick={handleDirectAdd}
    >
      Add to catalog
    </button>
  );
}
