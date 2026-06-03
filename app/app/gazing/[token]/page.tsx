import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { getServerUser } from "@/lib/supabase/cached";

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

  return (
    <main className="gazing-page">
      <div className="gazing">
        <section className="gazing-hero">
          <div className="gazing-eyebrow">
            {invite.inviter} summons you to a<br />
            <b>Shared Gazing</b>
          </div>
          {invite.poster_url ? (
            <img className="gazing-poster" src={invite.poster_url} alt={invite.film_title} />
          ) : null}
          <p className="gazing-flavor">&ldquo;A fellow goblin invites you into the dark.&rdquo;</p>
        </section>

        <section className="gazing-deets" aria-label="Shared gazing details">
          <div className="gazing-title">{invite.film_title}</div>
          <div className="gazing-row">
            <span className="gazing-key">When</span>
            <span>{when(invite.starts_at)}</span>
          </div>
          <div className="gazing-row">
            <span className="gazing-key">Where</span>
            <span>{invite.theater_name}</span>
          </div>
          {invite.format_label ? (
            <div className="gazing-row">
              <span className="gazing-key">Form</span>
              <span>{invite.format_label}</span>
            </div>
          ) : null}
        </section>

        <nav className="gazing-cta" aria-label="Shared gazing actions">
          <a className="btn" href={invite.tickets_url} target="_blank" rel="noreferrer">
            Get tickets
          </a>
          <Link className="btn-outline" href={watchlistHref}>
            Add to watchlist
          </Link>
          <Link className="btn-outline" href={signupHref}>
            Join the coven
          </Link>
        </nav>
      </div>
    </main>
  );
}
