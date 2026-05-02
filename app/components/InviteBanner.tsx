"use client";

interface Props {
  inviterUsername: string;
}

export default function InviteBanner({ inviterUsername }: Props) {
  return (
    <div className="invite-banner" role="region" aria-label="Coven invite">
      <div className="invite-banner-text">
        <strong>@{inviterUsername}</strong> invited you to Film Goblin.{" "}
        <span className="invite-banner-sub">Sign up to bind with their coven.</span>
      </div>
      <a
        href={`/auth/signup?invite=${encodeURIComponent(inviterUsername)}`}
        className="btn btn-sm"
      >
        Sign up
      </a>
    </div>
  );
}
