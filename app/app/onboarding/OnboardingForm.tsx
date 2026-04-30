"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FilmPoster, { type Film } from "@/components/FilmPoster";
import { completeOnboarding } from "@/lib/actions/onboarding";

export interface DbFilm {
  id: string;
  itunes_id: number | null;
  title: string;
  director: string;
  year: number;
  genre_primary: string;
  artwork_url: string;
}

interface Props {
  initialFilms: DbFilm[];
  initialUsername: string;
}

export default function OnboardingForm({ initialFilms, initialUsername }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [threshold, setThreshold] = useState(30);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const results = useMemo(() => {
    if (!q.trim()) return initialFilms;
    const n = q.trim().toLowerCase();
    return initialFilms.filter(
      f => f.title.toLowerCase().includes(n) || (f.director ?? "").toLowerCase().includes(n),
    );
  }, [q, initialFilms]);

  const trimmedUsername = username.trim();
  const usernameFormatOk = /^[a-z0-9._]+$/.test(trimmedUsername);
  const usernameOk = trimmedUsername.length > 0 && usernameFormatOk;
  const watchlistOk = watchlist.length >= 3;
  const canSubmit = usernameOk && watchlistOk;

  const disabledReason =
    trimmedUsername.length > 0 && !usernameFormatOk
      ? "Username: lowercase letters, numbers, dots, underscores only."
      : !usernameOk && !watchlistOk
      ? "Choose a username, and pick three films."
      : !usernameOk
      ? "Choose a username."
      : !watchlistOk
      ? "Pick three films to begin."
      : "";

  function toggleFilm(id: string) {
    setWatchlist(ws =>
      ws.includes(id) ? ws.filter(x => x !== id) : ws.length < 10 ? [...ws, id] : ws,
    );
  }

  async function onSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await completeOnboarding({
        username: username.trim(),
        watchlistFilmIds: watchlist,
        thresholdPct: threshold,
      });
      router.push("/home");
    } catch (err) {
      if (err && typeof err === "object" && "digest" in err) return;
      console.error(err);
      setSubmitting(false);
    }
  }

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <div className="caps" style={{ fontSize: 10, color: "var(--accent)", marginBottom: 8 }}>Your Username</div>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="moss.witch"
          maxLength={24}
          style={{
            width: "100%", padding: "12px 14px",
            background: "var(--void-2)", border: "2px solid var(--muted)",
            fontFamily: "var(--font-head)", fontSize: 22, color: "var(--bone)",
            outline: "none",
          }}
        />
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, fontStyle: "italic", color: "var(--muted)", marginTop: 6 }}>
          This is what the coven sees when you review.
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div className="caps" style={{ fontSize: 10, color: "var(--accent)", marginBottom: 8 }}>Alert Threshold</div>
        <div style={{ background: "var(--void-2)", border: "2px solid var(--muted)", padding: "18px 22px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14 }}>
              Alert me when a tracked film drops at least
            </span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 52, lineHeight: 1, color: "var(--accent)" }}>
              −{threshold}%
            </span>
          </div>
          <input
            type="range" min={10} max={75} step={5}
            value={threshold}
            onChange={e => setThreshold(+e.target.value)}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
            <span>−10% (a flinch)</span>
            <span>−40% (a real deal)</span>
            <span>−75% (a gift)</span>
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
          <div className="caps" style={{ fontSize: 10, color: "var(--accent)" }}>Pick Three Films</div>
          <div className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>
            {watchlistOk ? `${watchlist.length} chosen — ready` : `${watchlist.length} of 3`}
          </div>
        </div>
        <div style={{ position: "relative", marginBottom: 20 }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search the grimoire…"
            style={{
              width: "100%", padding: "12px 14px",
              background: "var(--void-2)", border: "2px solid var(--muted)",
              fontFamily: "var(--font-ui)", fontSize: 16, color: "var(--bone)",
              outline: "none",
            }}
          />
          <span className="caps" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)" }}>
            {results.length} results
          </span>
        </div>

        {results.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
            Nothing in the grimoire matches.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
            {results.slice(0, 18).map(f => {
              const on = watchlist.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggleFilm(f.id)}
                  style={{
                    display: "block", width: "100%",
                    background: "transparent", border: 0, padding: 0, margin: 0, cursor: "pointer",
                    textAlign: "left", fontFamily: "inherit", color: "inherit",
                    alignSelf: "start",
                  }}
                >
                  <div style={{ position: "relative", outline: on ? "2px solid var(--accent)" : "2px solid transparent", outlineOffset: 0 }}>
                    <FilmPoster
                      film={f as unknown as Film}
                      size="md"
                      style={{ width: "100%", height: "auto", aspectRatio: "2/3" }}
                    />
                    {on && <span className="poster-check-pill" aria-hidden>✓</span>}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{f.title}</div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                      {f.year}
                      {f.director ? <span> · {f.director}</span> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", padding: "40px 0 0" }}>
        <button
          type="button"
          className="btn btn-lg"
          disabled={!canSubmit || submitting}
          onClick={onSubmit}
          style={{
            minWidth: 240,
            opacity: canSubmit && !submitting ? 1 : 0.4,
            cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
            fontSize: 18,
          }}
        >
          {submitting ? "Sealing the pact…" : "Enter →"}
        </button>
        {disabledReason && (
          <div style={{ marginTop: 12, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)" }}>
            {disabledReason}
          </div>
        )}
      </div>
    </>
  );
}
