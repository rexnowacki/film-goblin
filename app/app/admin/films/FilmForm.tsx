"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminCreateFilm, adminUpdateFilm, type FilmFormFields } from "@/lib/actions/admin/films";

interface Props {
  mode: "create" | "edit";
  filmId?: string; // required when mode=edit
  initial: FilmFormFields;
  onSuccess?: () => void; // if provided, called instead of navigating (e.g. modal context)
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: 10,
  background: "var(--void-2)",
  border: "2px solid var(--muted)",
  color: "var(--bone)",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
};

const LABEL_STYLE: React.CSSProperties = { display: "block", marginBottom: 14 };
const CAPS_STYLE: React.CSSProperties = { fontSize: 11, marginBottom: 6 };

export default function FilmForm({ mode, filmId, initial, onSuccess }: Props) {
  const [fields, setFields] = useState<FilmFormFields>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function set<K extends keyof FilmFormFields>(k: K, v: FilmFormFields[K]) {
    setFields(f => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const result = mode === "create"
        ? await adminCreateFilm(fields)
        : await adminUpdateFilm(filmId!, fields);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      if (onSuccess) {
        onSuccess();
      } else if (mode === "create") {
        router.push("/admin/films/new");
      } else {
        router.push("/admin/films");
      }
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 720 }}>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Title *</div>
        <input style={INPUT_STYLE} value={fields.title} onChange={e => set("title", e.target.value)} required />
      </label>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Director *</div>
        <input style={INPUT_STYLE} value={fields.director} onChange={e => set("director", e.target.value)} required />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <label>
          <div className="caps" style={CAPS_STYLE}>Year *</div>
          <input style={INPUT_STYLE} type="number" min={1900} max={new Date().getFullYear() + 5} value={fields.year || ""} onChange={e => set("year", Number(e.target.value))} required />
        </label>
        <label>
          <div className="caps" style={CAPS_STYLE}>Runtime (min)</div>
          <input style={INPUT_STYLE} type="number" min={0} value={fields.runtime_min || ""} onChange={e => set("runtime_min", Number(e.target.value))} />
        </label>
      </div>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Genre primary *</div>
        <input style={INPUT_STYLE} value={fields.genre_primary} onChange={e => set("genre_primary", e.target.value)} required />
      </label>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Description</div>
        <textarea style={{ ...INPUT_STYLE, fontFamily: "var(--font-serif)", fontStyle: "italic" }} rows={4} value={fields.description} onChange={e => set("description", e.target.value)} />
      </label>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Content advisory</div>
        <input style={INPUT_STYLE} value={fields.content_advisory} onChange={e => set("content_advisory", e.target.value)} placeholder="e.g. R, TV-MA" />
      </label>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Artwork URL</div>
        <input style={INPUT_STYLE} type="url" value={fields.artwork_url} onChange={e => set("artwork_url", e.target.value)} />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 14 }}>
        <label>
          <div className="caps" style={CAPS_STYLE}>iTunes ID</div>
          <input style={INPUT_STYLE} type="number" value={fields.itunes_id ?? ""} onChange={e => set("itunes_id", e.target.value ? Number(e.target.value) : null)} />
        </label>
        <label>
          <div className="caps" style={CAPS_STYLE}>iTunes URL</div>
          <input style={INPUT_STYLE} type="url" value={fields.itunes_url} onChange={e => set("itunes_url", e.target.value)} />
        </label>
      </div>
      <label className="check-zine" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={fields.tracking} onChange={e => set("tracking", e.target.checked)} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Tracking (worker polls iTunes for price updates)</span>
      </label>
      <label className="check-zine" style={{ marginBottom: 20, display: "flex" }}>
        <input type="checkbox" checked={fields.available} onChange={e => set("available", e.target.checked)} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Available (visible on public surfaces)</span>
      </label>

      {err && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>{err}</div>}

      <button type="submit" className="btn" disabled={saving}>
        {saving ? "Saving…" : mode === "create" ? "Create film" : "Save changes"}
      </button>
    </form>
  );
}
