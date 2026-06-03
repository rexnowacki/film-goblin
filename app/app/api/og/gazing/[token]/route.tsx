import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function upscale(url: string): string {
  return url.replace(/\d+x\d+bb/, "600x900bb");
}

function titleSize(title: string): number {
  if (title.length > 45) return 50;
  if (title.length > 30) return 64;
  if (title.length > 18) return 78;
  return 92;
}

function dayLine(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

function timeLine(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

const fallback = (
  <div
    style={{
      display: "flex",
      width: "100%",
      height: "100%",
      background: "#0A0A0A",
      alignItems: "center",
      justifyContent: "center",
      color: "#FF2D88",
      fontSize: 48,
      fontFamily: "sans-serif",
      fontWeight: 800,
      letterSpacing: "0.05em",
    }}
  >
    FILM GOBLIN
  </div>
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = serviceRoleClient();
  const { data: invite } = await supabase
    .from("gazing_invites")
    .select("film_title, poster_url, theater_name, starts_at, format_label")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return new ImageResponse(fallback, { width: 1200, height: 630 });
  }

  const poster = invite.poster_url ? upscale(invite.poster_url) : null;
  const whereLine = [invite.theater_name, invite.format_label].filter(Boolean).join("  ·  ");

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#0A0A0A",
          color: "#F3ECD8",
          fontFamily: "sans-serif",
        }}
      >
        {/* Poster column — dominant, full-height, whole artwork visible. */}
        <div style={{ display: "flex", width: 500, height: 630, flexShrink: 0, background: "#FF2D88" }}>
          {poster ? (
            <img src={poster} width={500} height={630} style={{ objectFit: "cover" }} alt="" />
          ) : (
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                color: "#0A0A0A",
                fontSize: 44,
                fontWeight: 800,
                letterSpacing: "0.06em",
              }}
            >
              FILM GOBLIN
            </div>
          )}
        </div>

        {/* Accent seam between poster and text. */}
        <div style={{ display: "flex", width: 8, height: 630, background: "#FF2D88", flexShrink: 0 }} />

        {/* Text column — large, high-contrast, poster-forward invite. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 56px 50px",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 30,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#FF2D88",
                fontWeight: 800,
                marginBottom: 24,
                lineHeight: 1.1,
              }}
            >
              A fellow goblin is calling
            </div>

            <div
              style={{
                display: "flex",
                fontSize: titleSize(invite.film_title),
                fontWeight: 800,
                lineHeight: 1.0,
                color: "#F3ECD8",
                marginBottom: 30,
              }}
            >
              {invite.film_title}
            </div>

            <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: "#F3ECD8", marginBottom: 8 }}>
              {dayLine(invite.starts_at)}
            </div>
            <div style={{ display: "flex", fontSize: 52, fontWeight: 800, color: "#FF2D88", marginBottom: 16 }}>
              {timeLine(invite.starts_at)}
            </div>
            {whereLine && (
              <div style={{ display: "flex", fontSize: 28, color: "rgba(243, 236, 216, 0.72)", letterSpacing: "0.02em" }}>
                {whereLine}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div style={{ fontSize: 24, fontStyle: "italic", color: "rgba(243, 236, 216, 0.8)" }}>
              a shared gazing awaits
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(243, 236, 216, 0.4)" }}>
              Film Goblin
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
