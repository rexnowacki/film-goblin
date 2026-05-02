"use client";

interface Props {
  fromUsername: string | null;
}

export default function FilmCTABanner({ fromUsername }: Props) {
  const isReferral = fromUsername !== null;
  const text = isReferral ? (
    <><strong>@{fromUsername}</strong> shared this with you. Sign up to bind with their coven.</>
  ) : (
    <>Track this on Film Goblin. Get a ping when the price drops.</>
  );
  const href = isReferral
    ? `/auth/signup?invite=${encodeURIComponent(fromUsername)}`
    : `/auth/signup`;

  return (
    <div className="invite-banner" role="region" aria-label="Sign up CTA">
      <div className="invite-banner-text">{text}</div>
      <a href={href} className="btn btn-sm">Sign up</a>
    </div>
  );
}
