"use client";

import { useState, useEffect, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import { searchFilmForRequest, submitFilmRequest } from "@/lib/actions/film-requests";
import type { FilmRequestCandidate, FilmRequestInput } from "@/lib/actions/film-requests";
import { useToast } from "@/components/ToastProvider";

interface Props {
  query: string;
  onClose: () => void;
}

export default function FilmRequestSheet({ query, onClose }: Props) {
  const { toast } = useToast();
  const [stage, setStage] = useState<"searching" | "confirm" | "submitting" | "done">("searching");
  const [candidate, setCandidate] = useState<FilmRequestCandidate | null>(null);
  const [manualTitle, setManualTitle] = useState(query);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await searchFilmForRequest(query);
      if (!res.ok) {
        setResultMsg(res.error);
        setStage("done");
        return;
      }
      setCandidate(res.result);
      setStage("confirm");
    });
  }, []);

  async function handleSubmit() {
    if (!candidate) return;
    setStage("submitting");

    let input: FilmRequestInput;
    if (candidate.source === "itunes") {
      input = {
        title: candidate.hit.title,
        year: candidate.hit.year,
        source: "itunes",
        needs_itunes_id: false,
        itunes_id: candidate.hit.itunes_id,
        tmdb_id: null,
        artwork_url: candidate.hit.artwork_url,
        director: candidate.hit.director,
        description: candidate.hit.description,
        runtime_min: candidate.hit.runtime_min,
        genre_primary: candidate.hit.genre_primary,
        content_advisory: candidate.hit.content_advisory,
        itunes_url: candidate.hit.itunes_url,
      };
    } else if (candidate.source === "tmdb") {
      input = {
        title: candidate.hit.title,
        year: candidate.hit.year,
        source: "tmdb",
        needs_itunes_id: true,
        itunes_id: null,
        tmdb_id: candidate.hit.tmdb_id,
        artwork_url: candidate.hit.poster_url,
        director: null,
        description: candidate.hit.overview,
        runtime_min: null,
        genre_primary: null,
        content_advisory: null,
        itunes_url: null,
      };
    } else {
      input = {
        title: manualTitle.trim(),
        year: null,
        source: "manual",
        needs_itunes_id: true,
        itunes_id: null,
        tmdb_id: null,
        artwork_url: null,
        director: null,
        description: null,
        runtime_min: null,
        genre_primary: null,
        content_advisory: null,
        itunes_url: null,
      };
    }

    const result = await submitFilmRequest(input);

    if (result.status === "ok") {
      toast("Request sent. We'll notify you when it's added.");
      onClose();
      return;
    }
    if (result.status === "already_in_catalog") {
      setResultMsg(`already_in_catalog:${result.filmId}`);
    } else if (result.status === "already_requested") {
      setResultMsg(`already_requested:${result.requestCount}`);
    } else if (result.status === "already_on_list") {
      setResultMsg("already_on_list");
    } else {
      setResultMsg(`error:${result.message}`);
    }
    setStage("done");
  }

  const artworkUrl =
    candidate?.source === "itunes" ? candidate.hit.artwork_url
    : candidate?.source === "tmdb" ? candidate.hit.poster_url
    : null;
  const title =
    candidate?.source === "itunes" ? candidate.hit.title
    : candidate?.source === "tmdb" ? candidate.hit.title
    : null;
  const year =
    candidate?.source === "itunes" ? candidate.hit.year
    : candidate?.source === "tmdb" ? candidate.hit.year
    : null;
  const director =
    candidate?.source === "itunes" ? candidate.hit.director : null;

  return (
    <BottomSheet title="Request a Film" onClose={onClose} open>
      <div style={{ padding: "0 20px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {stage === "searching" && (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", textAlign: "center", paddingTop: 20 }}>
            Searching…
          </p>
        )}

        {stage === "confirm" && candidate && candidate.source !== "manual" && (
          <>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              {artworkUrl && (
                <img
                  src={artworkUrl}
                  alt={title ?? ""}
                  style={{ width: 64, height: 96, objectFit: "cover", borderRadius: 4, flexShrink: 0, border: "1px solid #333" }}
                />
              )}
              <div>
                <div className="head" style={{ fontSize: 18, lineHeight: 1.2 }}>{title}</div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                  {[year, director].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15 }}>
              This the one?
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={handleSubmit}>
                Request it
              </button>
              <button className="btn btn-outline" onClick={onClose}>
                Not quite
              </button>
            </div>
          </>
        )}

        {stage === "confirm" && candidate?.source === "manual" && (
          <>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--muted)" }}>
              We couldn't find this film in any database. You can still request it by title:
            </p>
            <input
              className="input"
              value={manualTitle}
              onChange={e => setManualTitle(e.target.value)}
              placeholder="Film title"
              style={{ fontSize: 15 }}
            />
            <button className="btn" onClick={handleSubmit} disabled={!manualTitle.trim()}>
              Request it
            </button>
          </>
        )}

        {stage === "submitting" && (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", textAlign: "center" }}>
            Sending request…
          </p>
        )}

        {stage === "done" && resultMsg && (() => {
          if (resultMsg.startsWith("already_in_catalog:")) {
            const filmId = resultMsg.replace("already_in_catalog:", "");
            return (
              <p style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>
                Already in the catalog.{" "}
                <a href={`/film/${filmId}`} style={{ color: "var(--accent)" }}>View it →</a>
              </p>
            );
          }
          if (resultMsg.startsWith("already_requested:")) {
            const count = Number(resultMsg.replace("already_requested:", ""));
            return (
              <p style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>
                Already requested by {count} {count === 1 ? "person" : "people"} — you're now on the list.
              </p>
            );
          }
          if (resultMsg === "already_on_list") {
            return (
              <p style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>
                You've already requested this one.
              </p>
            );
          }
          const errMsg = resultMsg.startsWith("error:") ? resultMsg.replace("error:", "") : resultMsg;
          return (
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 15, color: "var(--blood)" }}>
              {errMsg}
            </p>
          );
        })()}

      </div>
    </BottomSheet>
  );
}
