"use client";

import { useMemo, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { useToast } from "@/components/ToastProvider";
import { createGazingInvite, summonCoven } from "@/lib/actions/gazing";
import type { FilmShowtime } from "@/lib/queries/showtimes";

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso)).replace(",", " ·");
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function pillTheaterName(name: string): string {
  return name === "The Loft Cinema" ? "The Loft" : name;
}

interface Group {
  key: string;
  slots: FilmShowtime[];
}

interface Props {
  showtimes: FilmShowtime[];
  filmId: string;
  filmTitle: string;
  canInvite: boolean;
}

export default function ShowtimesSheet({ showtimes, filmId, filmTitle, canInvite }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const { toast } = useToast();

  const theaterName = showtimes[0]?.theater_name ?? "The Loft";
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, FilmShowtime[]>();
    for (const showtime of showtimes) {
      const key = dayLabel(showtime.starts_at);
      const slots = map.get(key) ?? [];
      slots.push(showtime);
      map.set(key, slots);
    }
    return [...map.entries()].map(([key, slots]) => ({ key, slots }));
  }, [showtimes]);

  const selected = showtimes.find((showtime) => showtime.id === selectedId) ?? null;

  async function onShare() {
    if (!canInvite) {
      window.location.href = `/auth/signup?redirect=${encodeURIComponent(`/film/${filmId}`)}`;
      return;
    }
    if (!selected) return;

    setSharing(true);
    try {
      const { url } = await createGazingInvite(selected.id);
      const text = `a fellow goblin invites you to ${filmTitle} at ${timeLabel(selected.starts_at)}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: filmTitle, text, url });
        toast("Sharing...");
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast("Invite link copied");
      } else {
        toast("Copy unavailable");
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name !== "AbortError") toast("Invite failed");
    } finally {
      setSharing(false);
    }
  }

  async function onSummon() {
    if (!canInvite) {
      window.location.href = `/auth/signup?redirect=${encodeURIComponent(`/film/${filmId}`)}`;
      return;
    }
    if (!selected) return;

    setSummoning(true);
    try {
      await summonCoven(selected.id);
      toast("Summoned the coven");
      setOpen(false);
    } catch {
      toast("Summon failed");
    } finally {
      setSummoning(false);
    }
  }

  if (showtimes.length === 0) return null;

  return (
    <>
      <button type="button" className="showtimes-pill" onClick={() => setOpen(true)}>
        <span aria-hidden="true">▸</span>
        Now at {pillTheaterName(theaterName)}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={`Showtimes · ${filmTitle}`}>
        <div className="showtimes-sheet">
          {groups.map((group) => (
            <section key={group.key} className="showtimes-day" aria-label={group.key}>
              <div className="showtimes-day-hdr">{group.key}</div>
              <div className="showtimes-slots">
                {group.slots.map((showtime) => (
                  <button
                    key={showtime.id}
                    type="button"
                    className="showtimes-slot"
                    aria-pressed={selectedId === showtime.id}
                    onClick={() => setSelectedId(showtime.id)}
                  >
                    <span>{timeLabel(showtime.starts_at)}</span>
                    {showtime.format_label ? <span className="showtimes-slot-tag">{showtime.format_label}</span> : null}
                    {showtime.screen_label ? <span className="showtimes-slot-screen">{showtime.screen_label}</span> : null}
                  </button>
                ))}
              </div>
            </section>
          ))}

          <button
            type="button"
            className="showtimes-share"
            disabled={(canInvite && !selected) || sharing}
            onClick={onShare}
          >
            {!canInvite
              ? "Sign in to invite a goblin"
              : selected
                ? `Invite a goblin to ${timeLabel(selected.starts_at)}`
                : "Pick a showtime to invite a goblin"}
          </button>
          <button
            type="button"
            className="showtimes-share showtimes-summon"
            disabled={(canInvite && !selected) || summoning}
            onClick={onSummon}
          >
            {!canInvite
              ? "Sign in to summon the coven"
              : selected
                ? "👁 Summon the coven"
                : "Pick a showtime to summon the coven"}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
