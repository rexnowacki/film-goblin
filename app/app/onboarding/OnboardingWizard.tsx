"use client";

import { useState } from "react";
import { completeOnboarding } from "@/lib/actions/onboarding";
import TasteStep from "./TasteStep";
import FilmsStep from "./FilmsStep";
import CovenStep, { type StarterProfile } from "./CovenStep";
import type { DbFilm } from "./films-step-logic";

export type { DbFilm, StarterProfile };

interface Props {
  initialUsername: string;
  films: DbFilm[];
  starters: StarterProfile[];
  laneTagMap: Record<string, string>;
}

export default function OnboardingWizard({ initialUsername, films, starters, laneTagMap }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState("");
  const [laneTagIds, setLaneTagIds] = useState<string[]>([]);
  const [watchlistFilmIds, setWatchlistFilmIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function handleTasteNext(u: string, tags: string[]) {
    setUsername(u);
    setLaneTagIds(tags);
    setStep(2);
  }

  function handleFilmsNext(filmIds: string[]) {
    setWatchlistFilmIds(filmIds);
    setStep(3);
  }

  async function handleSubmit(followIds: string[]) {
    setSubmitting(true);
    setSubmitError("");
    try {
      await completeOnboarding({ username, watchlistFilmIds, laneTagIds, starterFollowIds: followIds });
    } catch {
      setSubmitting(false);
      setSubmitError("Something went wrong — go back and try a different username.");
    }
    // On success, completeOnboarding redirects — submitting stays true intentionally
  }

  const dotStyle = (active: boolean): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: active ? "var(--accent)" : "#333",
    display: "inline-block",
  });

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: 560, background: "var(--void-2)", border: "1px solid #222", padding: "32px 28px" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 32 }}>
          <span style={dotStyle(step >= 1)} />
          <span style={dotStyle(step >= 2)} />
          <span style={dotStyle(step >= 3)} />
        </div>

        {step === 1 && (
          <TasteStep
            initialUsername={initialUsername}
            laneTagMap={laneTagMap}
            onNext={handleTasteNext}
          />
        )}
        {step === 2 && (
          <FilmsStep
            films={films}
            laneTagIds={laneTagIds}
            onNext={handleFilmsNext}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <CovenStep
            starters={starters}
            onSubmit={handleSubmit}
            onBack={() => setStep(2)}
            submitting={submitting}
          />
        )}
        {step === 3 && submitError && (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--accent)", marginTop: 12, textAlign: "center" }}>
            {submitError}
          </p>
        )}
      </div>
    </div>
  );
}
