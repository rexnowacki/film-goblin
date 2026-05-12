import Image from "next/image";
import type { FilmCastMember } from "@/lib/queries/film-cast";
import { tmdbProfileUrl } from "@/lib/queries/film-cast";

export default function FilmCastStrip({ cast }: { cast: FilmCastMember[] }) {
  if (cast.length === 0) return null;

  return (
    <section style={{ width: "100%", maxWidth: 760 }}>
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12 }}>
        Cast
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        {cast.map((member) => {
          const profileUrl = tmdbProfileUrl(member.profile_path);
          return (
            <div
              key={member.id}
              style={{
                display: "grid",
                gridTemplateColumns: "46px 1fr",
                gap: 10,
                alignItems: "center",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 62,
                  background: "var(--void-2)",
                  border: "1px solid #333",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {profileUrl ? (
                  <Image
                    src={profileUrl}
                    alt=""
                    fill
                    sizes="46px"
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "radial-gradient(var(--accent) 1px, transparent 1.4px)",
                      backgroundSize: "7px 7px",
                      opacity: 0.35,
                    }}
                  />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {member.name}
                </div>
                {member.character && (
                  <div
                    style={{
                      marginTop: 3,
                      fontFamily: "var(--font-serif)",
                      fontStyle: "italic",
                      fontSize: 12,
                      color: "var(--muted)",
                      lineHeight: 1.25,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {member.character}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
