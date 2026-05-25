"use client";

import { useMemo, useState } from "react";
import {
  adminCreateBulkFilms,
  adminPreviewBulkFilms,
  type BulkFilmCreateResult,
  type BulkFilmPreviewRow,
} from "@/lib/actions/admin/bulk-films";

const TEXTAREA_STYLE: React.CSSProperties = {
  width: "100%",
  minHeight: 260,
  padding: 12,
  background: "var(--void-2)",
  border: "2px solid var(--muted)",
  color: "var(--bone)",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  lineHeight: 1.45,
};

function statusLabel(row: BulkFilmPreviewRow): string {
  switch (row.status) {
    case "matched_itunes": return "iTunes";
    case "matched_tmdb": return "TMDB";
    case "already_exists": return "Exists";
    case "duplicate_input": return "Duplicate";
    case "needs_review": return "Review";
    case "ignored": return "Ignored";
    case "error": return "Error";
    case "created": return "Created";
  }
}

function statusColor(row: BulkFilmPreviewRow): string {
  switch (row.status) {
    case "matched_itunes": return "var(--accent)";
    case "matched_tmdb": return "#6cf";
    case "already_exists": return "var(--muted)";
    case "duplicate_input": return "#fa0";
    case "needs_review":
    case "ignored": return "var(--muted)";
    case "error": return "var(--danger)";
    case "created": return "var(--accent)";
  }
}

export default function BulkAddFilmsClient() {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<BulkFilmPreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<BulkFilmCreateResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedRows = useMemo(
    () => rows.filter(row => selected.has(row.lineNumber) && row.fields),
    [rows, selected],
  );
  const selectableCount = rows.filter(row => row.selectable && row.fields).length;

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    if (!/\.(md|txt)$/i.test(file.name)) {
      setErr("Upload a .md or .txt file.");
      return;
    }
    setRawText(await file.text());
  }

  async function onPreview(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResults([]);
    setLoading(true);
    try {
      const result = await adminPreviewBulkFilms(rawText);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      setRows(result.rows);
      setSelected(new Set(result.rows.filter(row => row.selectable && row.fields).map(row => row.lineNumber)));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(lineNumber: number) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  }

  function toggleAll() {
    if (selectedRows.length === selectableCount) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.filter(row => row.selectable && row.fields).map(row => row.lineNumber)));
    }
  }

  async function onCreate() {
    setErr(null);
    setResults([]);
    setCreating(true);
    try {
      const result = await adminCreateBulkFilms(selectedRows.map(row => ({
        lineNumber: row.lineNumber,
        fields: row.fields!,
      })));
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      setResults(result.results);
      const createdLines = new Set(result.results.filter(row => row.status === "created").map(row => row.lineNumber));
      setRows(current => current.map(row => createdLines.has(row.lineNumber) ? { ...row, status: "created", selectable: false, message: "Created." } : row));
      setSelected(current => {
        const next = new Set(current);
        createdLines.forEach(line => next.delete(line));
        return next;
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={{ maxWidth: 860 }}>
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", marginTop: 0 }}>
          Paste one movie per line, or upload a Markdown/text file. Years are optional, but they help avoid remake mismatches.
        </p>
        <a href="/bulk-film-import-template.md" className="btn btn-sm btn-outline" style={{ textDecoration: "none", display: "inline-block", marginBottom: 14 }}>
          Download sample Markdown
        </a>
        <form onSubmit={onPreview}>
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder="- The Wicker Man (1973)&#10;- Possession (1981)&#10;- Cure (1997)"
            style={TEXTAREA_STYLE}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <label className="btn btn-sm btn-outline" style={{ cursor: "pointer" }}>
              Upload .md/.txt
              <input type="file" accept=".md,.txt,text/markdown,text/plain" onChange={onFileChange} style={{ display: "none" }} />
            </label>
            <button type="submit" className="btn btn-sm" disabled={loading || !rawText.trim()}>
              {loading ? "Finding matches..." : "Preview matches"}
            </button>
          </div>
        </form>
      </section>

      {err && <div style={{ color: "var(--danger)", fontStyle: "italic", fontSize: 13 }}>{err}</div>}

      {rows.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div className="caps" style={{ fontSize: 11, color: "var(--muted)" }}>
              {rows.length} reviewed / {selectableCount} ready / {selectedRows.length} selected
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={toggleAll} disabled={selectableCount === 0}>
                {selectedRows.length === selectableCount ? "Clear selected" : "Select ready"}
              </button>
              <button type="button" className="btn btn-sm" onClick={onCreate} disabled={creating || selectedRows.length === 0}>
                {creating ? "Creating..." : `Create ${selectedRows.length}`}
              </button>
            </div>
          </div>

          <div style={{ border: "1px solid #333" }}>
            {rows.map(row => (
              <div
                key={`${row.lineNumber}-${row.raw}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 54px minmax(160px, 1fr) minmax(180px, 1.5fr) auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderBottom: "1px solid #333",
                  opacity: row.status === "ignored" ? 0.55 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(row.lineNumber)}
                  onChange={() => toggle(row.lineNumber)}
                  disabled={!row.selectable || !row.fields}
                  aria-label={`Select line ${row.lineNumber}`}
                />
                {row.fields?.artwork_url ? (
                  <img src={row.fields.artwork_url} alt="" width={48} height={72} style={{ objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 48, height: 72, background: "var(--void-2)", border: "1px solid #333" }} />
                )}
                <div>
                  <div className="caps" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>Line {row.lineNumber}</div>
                  <div style={{ fontFamily: "var(--font-head)", fontSize: 16 }}>{row.inputTitle || row.raw}</div>
                  {row.inputYear && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{row.inputYear}</div>}
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-head)", fontSize: 16 }}>
                    {row.fields?.title ?? "No match"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                    {row.fields ? `${row.fields.director || "-"} / ${row.fields.year || "-"}` : row.message}
                  </div>
                  {row.message && row.fields && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, fontStyle: "italic" }}>{row.message}</div>
                  )}
                </div>
                <span className="caps" style={{ fontSize: 10, color: statusColor(row), border: "1px solid currentColor", padding: "3px 7px", whiteSpace: "nowrap" }}>
                  {statusLabel(row)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section style={{ maxWidth: 860 }}>
          <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Import results</h2>
          <div style={{ display: "grid", gap: 6 }}>
            {results.map(result => (
              <div key={`${result.lineNumber}-${result.title}`} style={{ fontSize: 13, fontFamily: "var(--font-ui)", color: result.status === "error" ? "var(--danger)" : "var(--bone)" }}>
                Line {result.lineNumber}: {result.title} - {result.message ?? result.status}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
