import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function upscale(url: string): string {
  return url.replace(/\d+x\d+bb/, "600x900bb");
}

function titleSize(title: string): number {
  if (title.length > 45) return 44;
  if (title.length > 30) return 54;
  if (title.length > 18) return 64;
  return 76;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = serviceRoleClient();
  const { data: film } = await sb
    .from("films")
    .select("title, director, year, runtime_min, description, artwork_url, genre_primary")
    .eq("id", id)
    .maybeSingle();

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

  if (!film) {
    return new ImageResponse(fallback, { width: 1200, height: 630 });
  }

  const poster = film.artwork_url ? upscale(film.artwork_url) : null;
  const desc = film.description
    ? film.description.slice(0, 130) + (film.description.length > 130 ? "…" : "")
    : null;
  const metaParts = [
    film.director,
    String(film.year),
    film.runtime_min ? `${film.runtime_min} min` : null,
  ].filter(Boolean);
  const meta = metaParts.join("  ·  ");

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
        {/* Poster column */}
        {poster && (
          <div style={{ display: "flex", width: 280, height: 630, flexShrink: 0, position: "relative" }}>
            <img
              src={poster}
              width={280}
              height={630}
              style={{ objectFit: "cover" }}
              alt=""
            />
            {/* Fade edge */}
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

        {/* Content panel */}
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
            {/* Eyebrow */}
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
              Film Goblin
            </div>

            {/* Title */}
            <div
              style={{
                display: "flex",
                fontSize: titleSize(film.title),
                fontWeight: 800,
                lineHeight: 1.0,
                color: "#F3ECD8",
                marginBottom: 20,
              }}
            >
              {film.title}
            </div>

            {/* Meta row */}
            <div
              style={{
                display: "flex",
                fontSize: 17,
                color: "rgba(243, 236, 216, 0.55)",
                letterSpacing: "0.04em",
                marginBottom: desc ? 24 : 0,
              }}
            >
              {meta}
            </div>

            {/* Description */}
            {desc && (
              <div
                style={{
                  display: "flex",
                  fontSize: 19,
                  fontStyle: "italic",
                  color: "rgba(243, 236, 216, 0.75)",
                  lineHeight: 1.5,
                }}
              >
                {desc}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "rgba(243, 236, 216, 0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              {film.genre_primary ?? ""}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(243, 236, 216, 0.35)",
                letterSpacing: "0.04em",
              }}
            >
              film-goblin.vercel.app
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
