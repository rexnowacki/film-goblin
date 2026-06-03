import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { getServerUser } from "@/lib/supabase/cached";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GazingInvite {
  token: string;
  created_by: string;
  film_id: string | null;
  film_title: string;
  poster_url: string | null;
  theater_name: string;
  starts_at: string;
  format_label: string | null;
  tickets_url: string;
  inviter: string;
}

async function loadInvite(token: string): Promise<GazingInvite | null> {
  const supabase = serviceRoleClient();
  const { data } = await supabase
    .from("gazing_invites")
    .select("token, created_by, film_id, film_title, poster_url, theater_name, starts_at, format_label, tickets_url")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", data.created_by)
    .maybeSingle();

  return {
    ...data,
    inviter: profile?.display_name || profile?.username || "A fellow goblin",
  };
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

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const invite = await loadInvite(token);
  if (!invite) return { title: "Shared Gazing — Film Goblin" };

  const title = `A shared gazing: ${invite.film_title}`;
  const description = `${invite.inviter} invites you to ${invite.film_title} at ${invite.theater_name}.`;
  const ogImage = `https://freshfromthepit.com/api/og/gazing/${token}`;

  return {
    title: `${title} — Film Goblin`,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function GazingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await loadInvite(token);
  if (!invite) notFound();

  const user = await getServerUser();
  const filmHref = invite.film_id ? `/film/${invite.film_id}` : "/films";
  const signupHref = `/auth/signup?redirect=${encodeURIComponent(filmHref)}`;
  const watchlistHref = user ? filmHref : signupHref;

  const metaParts = [when(invite.starts_at), invite.theater_name, invite.format_label].filter(Boolean) as string[];

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="films" showBack />
      <BottomNav current="films" />

      {/* Bone header band — mirrors /film: eyebrow + display title + meta row. */}
      <section className="grain-light" style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6, color: "var(--accent-deep)" }}>Shared Gazing</div>
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)", margin: 0, lineHeight: 0.92 }}>
            {invite.film_title}.
          </h1>
          <div style={{ marginTop: 10, fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--void)", opacity: 0.75, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {metaParts.map((part, i) => (
              <span key={i} style={{ display: "flex", gap: 12 }}>
                {i > 0 && <span aria-hidden="true">·</span>}
                <span>{part}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Cinematic hero — oversized poster, invite flavor + CTA cluster. */}
      <section style={{ background: "var(--void)", color: "var(--bone)", borderBottom: "3px solid var(--void)" }}>
        <div className="container-wide stackable" style={{ paddingTop: 56, paddingBottom: 56, "--stack-template": "minmax(280px, 420px) 1fr", "--stack-gap": "56px", alignItems: "start" } as React.CSSProperties}>
          <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
            {invite.poster_url ? (
              <img
                src={invite.poster_url}
                alt={invite.film_title}
                style={{ width: "100%", height: "auto", aspectRatio: "2 / 3", objectFit: "cover", boxShadow: "10px 10px 0 var(--accent)", border: "2px solid var(--void)" }}
              />
            ) : null}
          </div>
          <div className="film-hero-text">
            <div className="eyebrow" style={{ fontSize: 12, marginBottom: 16, color: "var(--accent)" }}>
              {invite.inviter} summons you to a shared gazing
            </div>
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", lineHeight: 1.4, margin: "0 0 28px", maxWidth: 640 }}>
              &ldquo;A fellow goblin invites you into the dark.&rdquo;
            </p>

            <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="btn btn-lg" href={invite.tickets_url} target="_blank" rel="noreferrer">
                Get tickets →
              </a>
              <Link className="btn-outline btn-lg" href={watchlistHref}>
                Add to watchlist
              </Link>
              {!user && (
                <Link className="btn-outline btn-lg" href={signupHref}>
                  Join the coven
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
