"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import FilmForm from "../FilmForm";
import AppleTvSearchBox from "../AppleTvSearchBox";
import ITunesPasteBox from "../iTunesPasteBox";
import TmdbSearchBox from "../TmdbSearchBox";
import { listFilmSeries, type ITunesSearchHit, type FilmFormFields, type FilmSeriesSummary } from "@/lib/actions/admin/films";

const BLANK: FilmFormFields = {
  itunes_id: null,
  title: "",
  director: "",
  year: 0,
  runtime_min: 0,
  genre_primary: "",
  description: "",
  content_advisory: "",
  artwork_url: "",
  itunes_url: "",
  tracking: false,
  available: true,
  tmdb_id: null,
  theatrical_release_date: null,
  series_id: null,
  series_new_name: "",
  series_order: null,
};

export default function AddFilmClient({ onSuccess }: { onSuccess?: () => void } = {}) {
  const searchParams = useSearchParams();
  const requestId = searchParams.get("request_id");

  const [initial, setInitial] = useState<FilmFormFields | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [requestTitle, setRequestTitle] = useState<string | null>(null);
  const [existingSeries, setExistingSeries] = useState<FilmSeriesSummary[]>([]);

  useEffect(() => {
    listFilmSeries().then(setExistingSeries).catch(() => {});
  }, []);

  useEffect(() => {
    if (!requestId) return;
    fetch(`/api/admin/film-request?id=${requestId}`)
      .then(r => r.json())
      .then((req: any) => {
        if (!req) return;
        setRequestTitle(req.title);
        setInitial({
          itunes_id: req.itunes_id ?? null,
          title: req.title ?? "",
          director: req.director ?? "",
          year: req.year ?? 0,
          runtime_min: req.runtime_min ?? 0,
          genre_primary: req.genre_primary ?? "",
          description: req.description ?? "",
          content_advisory: req.content_advisory ?? "",
          artwork_url: req.artwork_url ?? "",
          itunes_url: req.itunes_url ?? "",
          tracking: false,
          available: true,
          tmdb_id: req.tmdb_id ?? null,
          theatrical_release_date: null,
          series_id: null,
          series_new_name: "",
          series_order: null,
        });
        setFormKey(k => k + 1);
      })
      .catch(() => {});
  }, [requestId]);

  function prefillFromHit(hit: ITunesSearchHit) {
    setInitial({
      itunes_id: hit.itunes_id,
      title: hit.title,
      director: hit.director,
      year: hit.year,
      runtime_min: hit.runtime_min,
      genre_primary: hit.genre_primary,
      description: hit.description,
      content_advisory: hit.content_advisory,
      artwork_url: hit.artwork_url,
      itunes_url: hit.itunes_url,
      tracking: true,
      available: true,
      tmdb_id: null,
      theatrical_release_date: null,
      series_id: null,
      series_new_name: "",
      series_order: null,
    });
    setFormKey(k => k + 1);
  }

  function startManual() {
    setInitial({ ...BLANK });
    setFormKey(k => k + 1);
  }

  return (
    <div style={{ display: "grid", gap: 28 }}>
      {requestId && requestTitle && (
        <div style={{
          background: "#1a1500", border: "1px solid #3a2a00", borderRadius: 6,
          padding: "12px 16px", fontFamily: "var(--font-ui)", fontSize: 13,
        }}>
          <span style={{ color: "#fa0" }}>⚠</span>{" "}
          Fulfilling request for <strong>&ldquo;{requestTitle}&rdquo;</strong>.
          {!initial?.itunes_id && " iTunes ID not set — film will be unavailable until added."}
        </div>
      )}

      {!initial && (
        <>
          <section>
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 1 — Search Apple TV</h2>
            <AppleTvSearchBox onPick={prefillFromHit} />
          </section>

          <section>
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 2 — Paste Apple TV URL or trackId</h2>
            <ITunesPasteBox onPick={prefillFromHit} />
          </section>

          <section>
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 3 — No Apple TV match? Search TMDB</h2>
            <TmdbSearchBox onPick={fields => { setInitial(fields); setFormKey(k => k + 1); }} />
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={startManual}>
                Skip — enter completely manually
              </button>
            </div>
          </section>
        </>
      )}

      {initial && (
        <section>
          {!requestId && (
            <div style={{ marginBottom: 14 }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setInitial(null)}>
                ← Start over
              </button>
            </div>
          )}
          <FilmForm key={formKey} mode="create" initial={initial} requestId={requestId ?? undefined} onSuccess={onSuccess} existingSeries={existingSeries} />
        </section>
      )}
    </div>
  );
}
