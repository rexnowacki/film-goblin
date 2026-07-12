import AddFilmClient from "./AddFilmClient";

export default function NewFilmPage() {
  return (
    <div className="admin-form-page">
      <header className="admin-page-head"><div><div className="eyebrow">Catalog rite</div><h1>Summon a film</h1><p>Call a new title into the vault from Apple TV or TMDB.</p></div></header>
      <div className="admin-form-surface"><AddFilmClient /></div>
    </div>
  );
}
