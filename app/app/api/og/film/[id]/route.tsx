import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

// Portrait 2:3 card — the share flow lives in iMessage/WhatsApp, where a
// poster-shaped og:image reads like handing someone the VHS box. Landscape
// unfurlers (X large card) crop to the poster midsection; accepted trade
// for a private, friend-to-friend app. See spec amendment 3.
const W = 1000;
const H = 1500;

const VOID = "#0A0A0A";
const BONE = "#F3ECD8";
const ACCENT = "#FF2D88";

function upscale(url: string): string {
  // Apple artwork URLs embed the size; TMDB uses /w{N}/ path segments.
  return url
    .replace(/\d+x\d+bb/, "1000x1500bb")
    .replace(/\/w\d+\//, "/w780/");
}

function titleSize(title: string): number {
  if (title.length > 40) return 44;
  if (title.length > 24) return 54;
  return 66;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = serviceRoleClient();
  const { data: film } = await sb
    .from("films_with_stats")
    .select("title, director, year, artwork_url, available, latest_price")
    .eq("id", id)
    .maybeSingle();

  if (!film) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: VOID,
            alignItems: "center",
            justifyContent: "center",
            color: ACCENT,
            fontSize: 64,
            fontFamily: "sans-serif",
            fontWeight: 800,
            letterSpacing: "0.05em",
          }}
        >
          FILM GOBLIN
        </div>
      ),
      { width: W, height: H },
    );
  }

  const title = film.title ?? "Untitled";
  const poster = film.artwork_url ? upscale(film.artwork_url) : null;
  // Price sticker only when the film is actually buyable right now.
  const price =
    film.available && film.latest_price != null
      ? Number(film.latest_price)
      : null;
  const meta = [film.director, film.year != null ? String(film.year) : null]
    .filter(Boolean)
    .join("  ·  ");

  const brandBand = (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "column",
        padding: "140px 48px 44px",
        background: `linear-gradient(to bottom, rgba(10,10,10,0), rgba(10,10,10,0.88) 55%, rgba(10,10,10,0.97))`,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: titleSize(title),
          fontWeight: 800,
          lineHeight: 1.05,
          color: BONE,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 24,
          color: "rgba(243, 236, 216, 0.7)",
          letterSpacing: "0.04em",
          marginTop: 14,
        }}
      >
        {meta}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 30,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: ACCENT,
          }}
        >
          Film Goblin
        </div>
        <div
          style={{
            fontSize: 18,
            color: "rgba(243, 236, 216, 0.45)",
            letterSpacing: "0.04em",
          }}
        >
          freshfromthepit.com
        </div>
      </div>
    </div>
  );

  const priceSticker = price != null && (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: 44,
        right: 36,
        flexDirection: "column",
        alignItems: "center",
        background: ACCENT,
        color: VOID,
        padding: "22px 34px",
        border: `5px solid ${VOID}`,
        boxShadow: `8px 8px 0 ${VOID}`,
        transform: "rotate(-6deg)",
      }}
    >
      <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1 }}>
        ${price.toFixed(2)}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 19,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginTop: 8,
        }}
      >
        on Apple TV
      </div>
    </div>
  );

  const card = poster ? (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: VOID,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      <img
        src={poster}
        width={W}
        height={H}
        style={{ objectFit: "cover" }}
        alt=""
      />
      {brandBand}
      {priceSticker}
    </div>
  ) : (
    // No artwork: portrait text card, same dimensions so metadata stays honest.
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: VOID,
        fontFamily: "sans-serif",
        position: "relative",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 72px",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: ACCENT,
          marginBottom: 36,
        }}
      >
        Film Goblin
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 88,
          fontWeight: 800,
          lineHeight: 1.05,
          color: BONE,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 30,
          color: "rgba(243, 236, 216, 0.7)",
          marginTop: 28,
        }}
      >
        {meta}
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          bottom: 44,
          left: 72,
          fontSize: 18,
          color: "rgba(243, 236, 216, 0.45)",
          letterSpacing: "0.04em",
        }}
      >
        freshfromthepit.com
      </div>
      {priceSticker}
    </div>
  );

  return new ImageResponse(card, {
    width: W,
    height: H,
    headers: {
      // A price is baked into the pixels — keep the cache short so new
      // shares don't stamp a dead price after the weekly refresh. Sent
      // messages keep their cached preview regardless; that's OG's nature.
      "Cache-Control":
        price != null
          ? "public, max-age=3600, stale-while-revalidate=86400"
          : "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
