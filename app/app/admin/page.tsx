import Link from "next/link";

export default function AdminHome() {
  return (
    <div className="admin-index">
      <header className="admin-masthead grain-dark">
        <div className="admin-masthead__copy">
          <div className="eyebrow">Behind the velvet rope</div>
          <h1>The control crypt.</h1>
          <p>Catalog rites, member business, and the machinery that keeps the Pit breathing.</p>
        </div>
        <div className="admin-masthead__seal" aria-hidden="true">FG<br /><span>STAFF</span></div>
      </header>

      <div className="admin-tile-grid">
        <Tile number="01" href="/admin/films" title="Film Vault" blurb="Summon, edit, tag, or retire films in the catalog." />
        <Tile number="02" href="/admin/users" title="Member Ledger" blurb="Search accounts, create test users, and manage access." />
        <Tile number="03" href="/admin/announcements" title="Proclamations" blurb="Publish and archive site-wide or targeted announcements." />
        <Tile number="04" href="/admin/goblin-pick" title="Goblin Pick" blurb="Set the weekly recommendation shown in the feed." />
        <Tile number="05" href="/admin/film-requests" title="Summoning Queue" blurb="Review requests for films missing from the catalog." />
        <Tile number="06" href="/admin/invite-codes" title="Secret Keys" blurb="Create and revoke invite links and inspect their use." />
        <Tile number="07" href="/admin/site-settings" title="Engine Room" blurb="Site health, background jobs, and global controls." />
        <Tile number="08" href="/admin/badges" title="Badge Forge" blurb="Create achievement rules, upload artwork, and inspect awards." />
      </div>
    </div>
  );
}

function Tile({ number, href, title, blurb }: { number: string; href: string; title: string; blurb: string }) {
  return (
    <Link href={href} className="admin-tile">
      <span className="admin-tile__number">{number}</span>
      <div className="admin-tile__title">{title}</div>
      <div className="admin-tile__blurb">{blurb}</div>
      <span className="admin-tile__arrow" aria-hidden="true">↗</span>
    </Link>
  );
}
