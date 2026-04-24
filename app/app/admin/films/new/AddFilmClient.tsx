"use client";

import { useState } from "react";
import FilmForm from "../FilmForm";
import AppleTvSearchBox from "../AppleTvSearchBox";
import ITunesPasteBox from "../iTunesPasteBox";
import type { ITunesSearchHit } from "@/lib/actions/admin/films";
import type { FilmFormFields } from "@/lib/actions/admin/films";

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
};

export default function AddFilmClient() {
  const [initial, setInitial] = useState<FilmFormFields | null>(null);
  const [formKey, setFormKey] = useState(0);

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
    });
    setFormKey(k => k + 1);
  }

  function startManual() {
    setInitial({ ...BLANK });
    setFormKey(k => k + 1);
  }

  return (
    <div style={{ display: "grid", gap: 28 }}>
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
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 3 — No Apple TV match?</h2>
            <button type="button" className="btn btn-outline" onClick={startManual}>
              Enter manually
            </button>
          </section>
        </>
      )}

      {initial && (
        <section>
          <div style={{ marginBottom: 14 }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setInitial(null)}>
              ← Start over
            </button>
          </div>
          <FilmForm key={formKey} mode="create" initial={initial} />
        </section>
      )}
    </div>
  );
}
