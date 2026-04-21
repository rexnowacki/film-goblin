import { useState } from "react";
import FilmPoster from "../components/FilmPoster.jsx";
import Avatar from "../components/Avatar.jsx";
import TopNav from "../components/TopNav.jsx";
import { Stat } from "./DealsPage.jsx";
import { USERS, FILM_BY_ID } from "../data.js";

export default function FriendsPage({ onNavigate, onOpenFilm }) {
  const [tab, setTab] = useState("coven");
  const suggested = USERS.slice(3, 7);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="friends" onNavigate={onNavigate} />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "48px 0 32px" }} className="grain-light">
        <div className="container-wide" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 40, alignItems: "end" }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter IV · The Coven</div>
            <h1 className="display" style={{ fontSize: 112, margin: 0, lineHeight: 0.88 }}>
              Your <em style={{ color: "var(--accent)" }}>Coven</em>
            </h1>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 17, maxWidth: 520, margin: "16px 0 0" }}>
              The ones who send you films. The ones you send films to. The people whose taste you trust more than a critic's byline.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <Stat big="12" small="In your coven" />
            <Stat big="34" small="Recs sent" />
            <Stat big="28" small="Recs received" />
          </div>
        </div>
      </section>

      <section style={{ background: "var(--void-2)", borderBottom: "1px solid #333", position: "sticky", top: 55, zIndex: 10 }}>
        <div className="container-wide" style={{ padding: "14px 32px", display: "flex", gap: 18, alignItems: "center" }}>
          {[
            { id: "coven", label: "Your Coven · 12" },
            { id: "suggested", label: "Suggested" },
            { id: "activity", label: "Recent Activity" },
            { id: "requests", label: "Requests · 3" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="caps" style={{
              background: tab === t.id ? "var(--accent)" : "transparent",
              color: tab === t.id ? "var(--accent-ink)" : "var(--muted)",
              border: "1px solid " + (tab === t.id ? "var(--accent)" : "#333"),
              padding: "6px 14px", fontSize: 10, cursor: "pointer",
              fontFamily: "var(--font-ui)", fontWeight: 700,
            }}>{t.label}</button>
          ))}
        </div>
      </section>

      <div className="container-wide" style={{ padding: "36px 32px 60px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 40 }}>
        <main>
          {tab === "coven" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
              {USERS.map(u => <FriendCard key={u.handle} user={u} followed />)}
            </div>
          )}

          {tab === "suggested" && (
            <>
              <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 14 }}>Based on your taste in dread</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
                {suggested.map(u => <FriendCard key={u.handle} user={u} suggested />)}
              </div>
            </>
          )}

          {tab === "activity" && (
            <div style={{ display: "grid", gap: 0, borderTop: "1px solid #333" }}>
              {[
                { user: USERS[0], act: "recommended", film: "midsommar", time: "2h" },
                { user: USERS[1], act: "added to watchlist", film: "saintmaud", time: "3h" },
                { user: USERS[2], act: "reviewed", film: "hereditary", time: "5h" },
                { user: USERS[3], act: "owned", film: "cure", time: "6h" },
                { user: USERS[4], act: "recommended", film: "xx", time: "9h" },
                { user: USERS[5], act: "watched", film: "pearl", time: "12h" },
              ].map((a, i) => {
                const f = FILM_BY_ID[a.film];
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "48px 1fr 60px auto", gap: 16, padding: "18px 0", borderBottom: "1px solid #333", alignItems: "center" }}>
                    <Avatar name={a.user.name} color={a.user.color} size={40} />
                    <div>
                      <div style={{ fontSize: 13 }}>
                        <b>{a.user.name}</b>
                        <span style={{ color: "var(--muted)", margin: "0 6px" }}>{a.act}</span>
                        <b style={{ cursor: "pointer" }} onClick={() => onOpenFilm(f.id)}>{f.title}</b>
                      </div>
                      <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>@{a.user.handle} · {a.time}</div>
                    </div>
                    <FilmPoster film={f} size="xs" />
                    <button className="btn btn-sm btn-outline" style={{ fontSize: 10 }}>View</button>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "requests" && (
            <div style={{ display: "grid", gap: 14 }}>
              {USERS.slice(0, 3).map((u, i) => (
                <div key={u.handle} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto auto", gap: 14, alignItems: "center", padding: 16, border: "1px solid #333", background: "var(--void-2)" }}>
                  <Avatar name={u.name} color={u.color} size={52} />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{u.name}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>@{u.handle} · {["sent request 2h ago", "mutual: 3 friends", "sent request yesterday"][i]}</div>
                  </div>
                  <button className="btn btn-sm">✦ Accept</button>
                  <button className="btn btn-sm btn-outline">Dismiss</button>
                </div>
              ))}
            </div>
          )}
        </main>

        <aside>
          <div style={{
            background: "var(--bone)", color: "var(--void)",
            border: "3px solid var(--void)", padding: "22px 20px",
            boxShadow: "6px 6px 0 var(--accent)", transform: "rotate(-1deg)",
            position: "relative",
          }} className="grain-light">
            <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Conjure A Friend</div>
            <h3 className="display" style={{ fontSize: 38, margin: "0 0 10px", lineHeight: 0.95 }}>Invite by handle</h3>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, lineHeight: 1.4, margin: "0 0 14px" }}>
              If they're on Film Goblin already, we'll nudge them. If not, we'll send an invitation carved in runes.
            </p>
            <div style={{ border: "2px solid var(--void)", padding: "10px 12px", fontFamily: "var(--font-ui)", color: "var(--muted-dark)", marginBottom: 12, fontSize: 12 }}>
              @their.handle or email
            </div>
            <button className="btn btn-dark" style={{ width: "100%", justifyContent: "center" }}>
              ✦ Summon
            </button>
          </div>

          <div style={{ marginTop: 28 }}>
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12, borderBottom: "1px solid #2a2a2a", paddingBottom: 6 }}>Top Matches</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {suggested.slice(0, 3).map(u => (
                <li key={u.handle} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, alignItems: "center" }}>
                  <Avatar name={u.name} color={u.color} size={32} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{u.name}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>82% taste match</div>
                  </div>
                  <button className="caps" style={{
                    background: "transparent", color: "var(--accent)",
                    border: "1px solid var(--accent)", padding: "4px 8px",
                    fontSize: 9, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700,
                  }}>+ Add</button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FriendCard({ user, followed, suggested }) {
  return (
    <div style={{ border: "1px solid #333", padding: 18, background: "var(--void-2)", textAlign: "center", position: "relative" }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <Avatar name={user.name} color={user.color} size={64} />
      </div>
      <div className="head" style={{ fontSize: 20, marginTop: 10, lineHeight: 1.1 }}>{user.name}</div>
      <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>@{user.handle}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 12, fontSize: 11, color: "var(--muted)" }} className="caps">
        <span><b style={{ color: "var(--bone)" }}>{user.reviews}</b> reviews</span>
        <span><b style={{ color: "var(--bone)" }}>{user.followers}</b> followers</span>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 6, justifyContent: "center" }}>
        {followed ? (
          <>
            <button className="btn btn-sm" style={{ fontSize: 9, padding: "6px 10px" }}>✦ Recommend</button>
            <button className="btn btn-sm btn-outline" style={{ fontSize: 9, padding: "6px 10px" }}>Unfollow</button>
          </>
        ) : suggested ? (
          <>
            <button className="btn btn-sm" style={{ fontSize: 9, padding: "6px 10px" }}>+ Follow</button>
            <button className="btn btn-sm btn-outline" style={{ fontSize: 9, padding: "6px 10px" }}>Dismiss</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
