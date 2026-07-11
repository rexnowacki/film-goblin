import Link from "next/link";
import Avatar from "@/components/Avatar";
import GazingRsvpButton from "@/components/GazingRsvpButton";
import type { GazingListItem } from "@/lib/queries/gazings";

interface Props {
  id: string;
  title: string;
  description: string;
  items: GazingListItem[];
  section: "open" | "aftermath";
}

const ROLE_LABELS = {
  hosting: "Hosting",
  attending: "You're in",
  summoned: "Summoned",
} as const;

function formattedStart(item: GazingListItem): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: item.timezoneLabel,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat("en-US", options).format(new Date(item.startsAt));
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(item.startsAt));
  }
}

function locationLabel(item: GazingListItem): string {
  return item.venueKind === "home" ? "Home watch" : item.theaterName ?? "Theater gazing";
}

export default function GazingList({ id, title, description, items, section }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="gazings-section" aria-labelledby={id}>
      <div className="gazings-section__topline">
        <div>
          <h2 className="eyebrow" id={id}>{title}</h2>
          <p>{description}</p>
        </div>
        <span>{items.length}</span>
      </div>
      <div className="gazings-grid">
        {items.map(item => {
          const href = `/gazing/${item.token}`;
          const place = locationLabel(item);
          return (
            <article className="gazings-card" key={item.id}>
              <Link className="gazings-card__poster" href={href} prefetch={false} aria-label={`Open gazing for ${item.filmTitle}`}>
                {item.posterUrl ? (
                  <img src={item.posterUrl} alt="" />
                ) : (
                  <span aria-hidden="true">◉</span>
                )}
              </Link>
              <div className="gazings-card__body">
                <div className="gazings-card__topline">
                  <span className={`gazings-card__role is-${item.role}`}>{ROLE_LABELS[item.role]}</span>
                  <span className="gazings-card__venue">{place}</span>
                </div>
                <h3><Link href={href} prefetch={false}>{item.filmTitle}</Link></h3>
                <p className="gazings-card__when">{formattedStart(item)}</p>
                <p className="gazings-card__host">
                  Hosted by {item.host ? `@${item.host.username}` : "a fellow goblin"}
                </p>
                {item.roster.count > 0 && (
                  <div className="gazings-card__roster" aria-label={`${item.roster.count} attending`}>
                    <span className="gazings-card__avatars" aria-hidden="true">
                      {item.roster.avatars.map(person => (
                        <Avatar key={person.id} name={person.username} color="var(--accent)" size={25} url={person.avatar_url} />
                      ))}
                    </span>
                    <span>{item.roster.count} {item.roster.count === 1 ? "goblin" : "goblins"} in</span>
                  </div>
                )}
                <div className="gazings-card__actions">
                  <Link className="btn-outline btn-sm" href={href} prefetch={false}>
                    {section === "aftermath" ? "Close the loop" : "Open gazing"} →
                  </Link>
                  {section === "open" && item.role === "summoned" && (
                    <GazingRsvpButton
                      token={item.token}
                      inviteId={item.id}
                      filmTitle={item.filmTitle}
                      startsAt={item.startsAt}
                      locationLabel={place}
                      initialAttending={false}
                      isHost={false}
                      canRsvp
                      signupHref={href}
                      size="sm"
                    />
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
