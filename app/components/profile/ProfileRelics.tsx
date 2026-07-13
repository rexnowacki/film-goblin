import type { ProfileBadge } from "@/lib/queries/badges";

const BADGE_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatAwardedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Earned in the Pit" : `Earned ${BADGE_DATE.format(date)}`;
}

export default function ProfileRelics({ badges }: { badges: ProfileBadge[] }) {
  if (badges.length === 0) {
    return (
      <div className="profile-relic-empty">
        <div className="profile-relic-empty__seal" aria-hidden="true">◇</div>
        <div>
          <strong>No relics pried from the dark yet.</strong>
          <span>When badges awaken, the trophies will gather here.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-relic-grid" aria-label="Earned relics">
      {badges.map((badge) => (
        <article className="profile-relic-card" key={badge.id}>
          <div className="profile-relic-art">
            <img
              src={badge.image_url}
              alt={`${badge.name} badge`}
              width={160}
              height={160}
              loading="lazy"
              decoding="async"
            />
          </div>
          <h3>{badge.name}</h3>
          <p>{badge.description}</p>
          <time dateTime={badge.awarded_at}>{formatAwardedAt(badge.awarded_at)}</time>
        </article>
      ))}
    </div>
  );
}
