import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function upscale(url: string): string {
  return url.replace(/\d+x\d+bb/, "600x900bb");
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function titleSize(title: string): number {
  if (title.length > 45) return 44;
  if (title.length > 30) return 54;
  if (title.length > 18) return 64;
  return 76;
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
  const meta = [when(invite.starts_at), invite.theater_name, invite.format_label].filter(Boolean).join("  ·  ");

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
        {poster && (
          <div style={{ display: "flex", width: 280, height: 630, flexShrink: 0, position: "relative" }}>
            <img src={poster} width={280} height={630} style={{ objectFit: "cover" }} alt="" />
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: 100,
                background: "linear-gradient(to right, transparent, #0A0A0A)",
              }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: poster ? "52px 60px 52px 36px" : "52px 60px",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 14,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#FF2D88",
                fontWeight: 700,
                marginBottom: 20,
              }}
            >
              Shared Gazing
            </div>

            <div
              style={{
                display: "flex",
                fontSize: titleSize(invite.film_title),
                fontWeight: 800,
                lineHeight: 1.0,
                color: "#F3ECD8",
                marginBottom: 22,
              }}
            >
              {invite.film_title}
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 20,
                color: "rgba(243, 236, 216, 0.68)",
                letterSpacing: "0.04em",
              }}
            >
              {meta}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div style={{ fontSize: 19, fontStyle: "italic", color: "rgba(243, 236, 216, 0.75)" }}>
              a fellow goblin invites you to a shared gazing
            </div>
            <div style={{ fontSize: 13, color: "rgba(243, 236, 216, 0.35)", letterSpacing: "0.04em" }}>
              freshfromthepit.com
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
