import Link from "next/link";

export default function AdminHome() {
  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 28 }}>Admin</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--grid-gap)" }}>
        <Tile href="/admin/films" title="Films" blurb="Add, edit, or retire films. iTunes lookup or manual entry." />
        <Tile href="/admin/users" title="Users" blurb="Search accounts, create test users, delete accounts." />
        <Tile href="/admin/announcements" title="Announcements" blurb="Publish and archive site-wide or targeted announcements." />
        <Tile href="/admin/goblin-pick" title="Goblin Pick" blurb="Set the weekly film recommendation shown on the home feed." />
        <Tile href="/admin/film-requests" title="Film Requests" blurb="Review and fulfill user requests for films not yet in the catalog." />
        <Tile href="/admin/invite-codes" title="Invite Codes" blurb="Create and revoke invite links. See who's used each code." />
        <Tile href="/admin/site-settings" title="Dashboard" blurb="Site stats, background jobs, and site-wide controls like invite gating." />
      </div>
    </div>
  );
}

function Tile({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: 22,
        border: "2px solid var(--bone)",
        background: "var(--void-2)",
        color: "var(--bone)",
        textDecoration: "none",
      }}
    >
      <div className="head" style={{ fontSize: 28, marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, opacity: 0.8 }}>{blurb}</div>
    </Link>
  );
}
