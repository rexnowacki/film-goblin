"use client";

import { useToast } from "./ToastProvider";

const SITE_ORIGIN = "https://freshfromthepit.com";

export function buildShareUrl(filmId: string, sharerUsername: string | null): string {
  const base = `${SITE_ORIGIN}/film/${filmId}`;
  return sharerUsername ? `${base}?from=${encodeURIComponent(sharerUsername)}` : base;
}

export function buildShareMessage(title: string, year: number, url: string): string {
  return `the goblin's calling: ${title} (${year}). ${url}`;
}

interface Props {
  filmId: string;
  title: string;
  year: number;
  sharerUsername: string | null;
}

export default function ShareFilmButton({ filmId, title, year, sharerUsername }: Props) {
  const { toast } = useToast();
  const url = buildShareUrl(filmId, sharerUsername);
  const message = buildShareMessage(title, year, url);

  async function share() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text: message });
        toast("Sharing…");
        return;
      }
      await navigator.clipboard.writeText(message);
      toast("Link copied");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return;
      toast("Copy failed");
    }
  }

  return (
    <button type="button" className="btn btn-outline btn-lg" onClick={share}>
      ✦ Share
    </button>
  );
}
