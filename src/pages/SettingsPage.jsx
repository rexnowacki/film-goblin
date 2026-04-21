import { useState } from "react";
import Avatar from "../components/Avatar.jsx";
import TopNav from "../components/TopNav.jsx";

const inputStyle = {
  width: "100%",
  background: "var(--void-2)",
  border: "1px solid #333",
  color: "var(--bone)",
  padding: "12px 14px",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  outline: "none",
};

export default function SettingsPage({ onNavigate }) {
  const [tab, setTab] = useState("profile");
  const [threshold, setThreshold] = useState(30);
  const [stores, setStores] = useState({ appletv: true, itunes: true, prime: false, criterion: true, shudder: false, mubi: false });
  const [notifs, setNotifs] = useState({ priceDrop: true, saleEnd: true, restock: true, listSale: true, friendRec: true, friendReview: false, weeklyDigest: true, email: true, push: true });
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(8);
  const [name, setName] = useState("moss.witch");
  const [bio, setBio] = useState("watches slowly and twice. never reviews on the first pass. keeper of seven grimoires.");
  const [region, setRegion] = useState("US");

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="settings" onNavigate={onNavigate} />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "36px 0" }} className="grain-light">
        <div className="container-wide" style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ position: "relative" }}>
            <Avatar name="Moss Witch" color="#3a5f3a" size={96} />
            <button style={{
              position: "absolute", bottom: -4, right: -4,
              width: 32, height: 32, borderRadius: "50%",
              background: "var(--accent)", color: "var(--accent-ink)",
              border: "2px solid var(--void)", cursor: "pointer",
              fontFamily: "var(--font-display)", fontSize: 16,
            }}>✎</button>
          </div>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 6 }}>Thy Chamber</div>
            <h1 className="display" style={{ fontSize: 88, lineHeight: 0.88, margin: 0 }}>
              @{name}
            </h1>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, margin: "8px 0 0", maxWidth: 640 }}>
              Settle thy preferences. Adjust thy oath. Manage the pact.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: "2px solid var(--void)" }}>
            <MiniStat big="412" small="Reviews" />
            <MiniStat big="1,823" small="Followers" accent />
            <MiniStat big="7" small="Grimoires" />
          </div>
        </div>
      </section>

      <div className="container-wide" style={{ padding: "36px 32px 80px", display: "grid", gridTemplateColumns: "220px 1fr", gap: 40 }}>
        <aside>
          <div style={{ position: "sticky", top: 80 }}>
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10, fontSize: 10 }}>Chapters</div>
            <nav style={{ display: "grid", gap: 2 }}>
              {[
                { id: "profile", label: "Profile", n: "I" },
                { id: "oath", label: "The Oath", n: "II" },
                { id: "storefronts", label: "Storefronts", n: "III" },
                { id: "notifications", label: "Notifications", n: "IV" },
                { id: "coven", label: "Coven & Privacy", n: "V" },
                { id: "danger", label: "Desanctify", n: "✗" },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  display: "grid", gridTemplateColumns: "28px 1fr",
                  alignItems: "center", gap: 10,
                  padding: "10px 12px",
                  background: tab === t.id ? "var(--accent)" : "transparent",
                  color: tab === t.id ? "var(--accent-ink)" : "var(--bone)",
                  border: tab === t.id ? "1px solid var(--accent)" : "1px solid #333",
                  borderLeft: tab === t.id ? "4px solid var(--void)" : "4px solid transparent",
                  cursor: "pointer",
                  textAlign: "left", fontFamily: "inherit",
                }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1, opacity: tab === t.id ? 1 : 0.5 }}>{t.n}</span>
                  <span className="caps" style={{ fontSize: 11, fontWeight: 700 }}>{t.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <section>
          {tab === "profile" && (
            <Panel title="Profile" subtitle="How the coven sees thee.">
              <Field label="Coven Name">
                <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Biography" sub="Will appear on thy profile and review pages.">
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4} style={{ ...inputStyle, fontFamily: "var(--font-serif)", fontStyle: "italic", resize: "vertical" }} />
              </Field>
              <Field label="Region" sub="We show prices in this region's currency.">
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ id: "US", l: "United States · USD" }, { id: "UK", l: "United Kingdom · GBP" }, { id: "CA", l: "Canada · CAD" }, { id: "AU", l: "Australia · AUD" }].map(r => (
                    <button key={r.id} onClick={() => setRegion(r.id)} className="caps" style={{
                      background: region === r.id ? "var(--accent)" : "transparent",
                      color: region === r.id ? "var(--accent-ink)" : "var(--bone)",
                      border: "1px solid " + (region === r.id ? "var(--accent)" : "#333"),
                      padding: "8px 12px", fontSize: 10, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700,
                    }}>{r.l}</button>
                  ))}
                </div>
              </Field>
            </Panel>
          )}

          {tab === "oath" && (
            <Panel title="The Oath" subtitle="The rules of thy disturbance. Sworn during the ritual. Re-negotiable.">
              <div style={{
                background: "var(--bone-2)", color: "var(--void)",
                border: "3px double var(--void)",
                padding: "22px 24px 18px",
                marginBottom: 24, transform: "rotate(-0.4deg)",
                position: "relative",
              }}>
                <div style={{ position: "absolute", inset: 8, border: "1px solid var(--void)", pointerEvents: "none" }} />
                <div className="caps" style={{ fontSize: 9, marginBottom: 8, opacity: 0.6 }}>Current Pact</div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.5 }}>
                  I, <b>@{name}</b>, do swear to be disturbed only when a tracked film drops by <b style={{ color: "var(--accent-deep)" }}>{threshold}% or more</b>, and not during the dreaming hours of <b>{quietStart}:00 → {quietEnd}:00</b>.
                </div>
              </div>

              <Field label="Threshold Of Pain" sub="Minimum discount before we interrupt you.">
                <div style={{ background: "var(--void-2)", border: "1px solid #333", padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Alert me at least</span>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 48, color: "var(--accent)", lineHeight: 1 }}>−{threshold}%</span>
                  </div>
                  <input type="range" min={10} max={75} step={5} value={threshold} onChange={e => setThreshold(+e.target.value)} style={{ width: "100%", accentColor: "var(--accent)" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.55, marginTop: 4 }} className="caps">
                    <span>−10% flinch</span><span>−40% deal</span><span>−75% gift</span>
                  </div>
                </div>
              </Field>

              <Field label="Dreaming Hours" sub="No omens during these hours. Sleep, dream, etc.">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", gap: 12, alignItems: "center" }}>
                  <div style={{ background: "var(--void-2)", border: "1px solid #333", padding: "12px 14px" }}>
                    <div className="caps" style={{ fontSize: 9, opacity: 0.6, marginBottom: 4 }}>From</div>
                    <input type="number" min={0} max={23} value={quietStart} onChange={e => setQuietStart(+e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-display)", fontSize: 36, padding: 0, background: "transparent", border: "0", color: "var(--accent)" }} />
                  </div>
                  <div style={{ textAlign: "center", fontFamily: "var(--font-display)", fontSize: 28, color: "var(--muted)" }}>→</div>
                  <div style={{ background: "var(--void-2)", border: "1px solid #333", padding: "12px 14px" }}>
                    <div className="caps" style={{ fontSize: 9, opacity: 0.6, marginBottom: 4 }}>Until</div>
                    <input type="number" min={0} max={23} value={quietEnd} onChange={e => setQuietEnd(+e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-display)", fontSize: 36, padding: 0, background: "transparent", border: "0", color: "var(--accent)" }} />
                  </div>
                </div>
              </Field>

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="btn">✦ Re-sign The Pact</button>
                <button className="btn btn-outline" style={{ color: "var(--bone)", borderColor: "#444" }}>Reset to default</button>
              </div>
            </Panel>
          )}

          {tab === "storefronts" && (
            <Panel title="Bound Storefronts" subtitle="Where we watch prices. Untick any you don't care about.">
              <div style={{ border: "1px solid #333" }}>
                {[
                  { id: "appletv", label: "Apple TV", sub: "the blessed storefront", icon: "◉" },
                  { id: "itunes", label: "iTunes", sub: "the elder storefront", icon: "♪" },
                  { id: "prime", label: "Prime Video", sub: "occasionally useful", icon: "▶" },
                  { id: "criterion", label: "Criterion Channel", sub: "canonical", icon: "✦" },
                  { id: "shudder", label: "Shudder", sub: "for the devout", icon: "☾" },
                  { id: "mubi", label: "Mubi", sub: "for the insufferable", icon: "◐" },
                ].map((s, i, arr) => (
                  <label key={s.id} style={{
                    display: "grid", gridTemplateColumns: "56px 40px 1fr auto", alignItems: "center",
                    borderBottom: i < arr.length - 1 ? "1px solid #333" : "none",
                    background: stores[s.id] ? "rgba(255,45,136,0.08)" : "transparent",
                    padding: "14px 0", cursor: "pointer",
                  }}>
                    <div style={{ textAlign: "center", fontFamily: "var(--font-display)", fontSize: 26, color: stores[s.id] ? "var(--accent)" : "var(--muted)" }}>{s.icon}</div>
                    <Toggle on={stores[s.id]} onChange={() => setStores(st => ({ ...st, [s.id]: !st[s.id] }))} />
                    <div>
                      <div className="head" style={{ fontSize: 18, lineHeight: 1 }}>{s.label}</div>
                      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)" }}>{s.sub}</div>
                    </div>
                    <div style={{ paddingRight: 16, fontSize: 10, color: "var(--muted)" }} className="caps">
                      {stores[s.id] ? "Bound" : "Dormant"}
                    </div>
                  </label>
                ))}
              </div>
              <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)", marginTop: 16 }}>
                We can't watch what we can't see. Storefronts not bound here are invisible to the oracle.
              </p>
            </Panel>
          )}

          {tab === "notifications" && (
            <Panel title="The Omens" subtitle="What's worth disturbing thee for, and how.">
              <div>
                <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10 }}>What</div>
                <div style={{ border: "1px solid #333" }}>
                  {[
                    { id: "priceDrop", l: "Price drop on a tracked film", sub: "when it crosses thy threshold" },
                    { id: "saleEnd", l: "Sale about to expire", sub: "last-chance warning, 12 hrs out" },
                    { id: "restock", l: "A removed film returned", sub: "back on a storefront you track" },
                    { id: "listSale", l: "Any film on a subscribed list drops", sub: "the curator's taste at a discount" },
                    { id: "friendRec", l: "Coven recommendation", sub: "a friend sent thee a film" },
                    { id: "friendReview", l: "Coven review", sub: "noisy; off by default" },
                    { id: "weeklyDigest", l: "The Weekly Scroll", sub: "sunday digest of everything" },
                  ].map((n, i, arr) => (
                    <label key={n.id} style={{
                      display: "grid", gridTemplateColumns: "48px 1fr", alignItems: "center", padding: "12px 16px",
                      borderBottom: i < arr.length - 1 ? "1px solid #333" : "none",
                      cursor: "pointer",
                    }}>
                      <Toggle on={notifs[n.id]} onChange={() => setNotifs(ns => ({ ...ns, [n.id]: !ns[n.id] }))} />
                      <div>
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{n.l}</div>
                        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--muted)" }}>{n.sub}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 24 }}>
                <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10 }}>Where</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", gap: 14, alignItems: "center", padding: 16, border: "1px solid #333", cursor: "pointer" }}>
                    <Toggle on={notifs.email} onChange={() => setNotifs(n => ({ ...n, email: !n.email }))} />
                    <div>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 700 }}>Email</div>
                      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--muted)" }}>sent to coven@gmail.com</div>
                    </div>
                  </label>
                  <label style={{ display: "flex", gap: 14, alignItems: "center", padding: 16, border: "1px solid #333", cursor: "pointer" }}>
                    <Toggle on={notifs.push} onChange={() => setNotifs(n => ({ ...n, push: !n.push }))} />
                    <div>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 700 }}>Push (on thy familiar)</div>
                      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--muted)" }}>iOS · Android · Browser</div>
                    </div>
                  </label>
                </div>
              </div>
            </Panel>
          )}

          {tab === "coven" && (
            <Panel title="Coven & Privacy" subtitle="Who sees thee. Who may whisper.">
              <Field label="Profile Visibility">
                <RadioGroup
                  initial="coven"
                  options={[
                    { id: "public", l: "Public", sub: "anyone with the link" },
                    { id: "coven", l: "Coven Only", sub: "followers see thee; strangers do not" },
                    { id: "private", l: "Hermit", sub: "invisible. reviews not attributed." },
                  ]}
                />
              </Field>
              <Field label="Who may recommend to thee?">
                <RadioGroup
                  initial="coven"
                  options={[
                    { id: "anyone", l: "Anyone", sub: "open spellwork" },
                    { id: "coven", l: "Only the Coven", sub: "friends only" },
                    { id: "no", l: "Nobody", sub: "do not disturb" },
                  ]}
                />
              </Field>
              <Field label="Data & Receipts">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button className="btn btn-sm btn-outline" style={{ color: "var(--bone)", borderColor: "#444" }}>Download thy grimoire</button>
                  <button className="btn btn-sm btn-outline" style={{ color: "var(--bone)", borderColor: "#444" }}>Import from Letterboxd</button>
                  <button className="btn btn-sm btn-outline" style={{ color: "var(--bone)", borderColor: "#444" }}>Clear watch history</button>
                </div>
              </Field>
            </Panel>
          )}

          {tab === "danger" && (
            <Panel title="Desanctify" subtitle="The end of the pact. Walk carefully.">
              <div style={{ display: "grid", gap: 14 }}>
                <DangerRow title="Pause the oracle" sub="No alerts. No digests. Your data stays." button="Pause for 7 days" />
                <DangerRow title="Leave the coven" sub="Your profile disappears. Reviews become anonymous." button="Deactivate" />
                <DangerRow title="Burn the records" sub="Delete thy account and all associated data. This is permanent and cannot be unmade." button="Burn It All" danger />
              </div>
            </Panel>
          )}
        </section>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <div>
      <div style={{ marginBottom: 28, paddingBottom: 18, borderBottom: "1px solid #2a2a2a" }}>
        <h2 className="display" style={{ fontSize: 64, lineHeight: 0.9, margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, color: "var(--muted)", margin: "6px 0 0" }}>{subtitle}</p>}
      </div>
      <div style={{ display: "grid", gap: 24 }}>{children}</div>
    </div>
  );
}

function Field({ label, sub, children }) {
  return (
    <div>
      <div className="caps" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--muted)", marginBottom: sub ? 4 : 10 }}>{label}</div>
      {sub && <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)", marginBottom: 10, opacity: 0.8 }}>{sub}</div>}
      {children}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={onChange} style={{
      width: 36, height: 22,
      background: on ? "var(--accent)" : "var(--void-3)",
      border: "1px solid " + (on ? "var(--accent)" : "#333"),
      position: "relative", cursor: "pointer", padding: 0,
      transition: "background 150ms",
    }}>
      <div style={{
        position: "absolute", top: 2, left: on ? 16 : 2,
        width: 16, height: 16,
        background: on ? "var(--accent-ink)" : "var(--bone)",
        transition: "left 150ms",
      }} />
    </button>
  );
}

function RadioGroup({ initial, options }) {
  const [val, setVal] = useState(initial);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {options.map(o => {
        const on = val === o.id;
        return (
          <button key={o.id} onClick={() => setVal(o.id)} style={{
            display: "grid", gridTemplateColumns: "32px 1fr", gap: 12, alignItems: "center",
            padding: "12px 14px",
            background: on ? "rgba(255,45,136,0.08)" : "transparent",
            border: "1px solid " + (on ? "var(--accent)" : "#333"),
            cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "var(--bone)",
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              border: "2px solid " + (on ? "var(--accent)" : "#555"),
              display: "grid", placeItems: "center",
            }}>
              {on && <div style={{ width: 8, height: 8, background: "var(--accent)", borderRadius: "50%" }} />}
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 700 }}>{o.l}</div>
              <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--muted)" }}>{o.sub}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DangerRow({ title, sub, button, danger }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 18px", border: "1px solid " + (danger ? "#b8221c" : "#333") }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-head)", fontSize: 20, lineHeight: 1, marginBottom: 4, color: danger ? "#ff6a5f" : "var(--bone)" }}>{title}</div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)" }}>{sub}</div>
      </div>
      <button className="btn btn-sm" style={{
        background: danger ? "#b8221c" : "transparent",
        color: danger ? "#f3ecd8" : "var(--bone)",
        border: "1px solid " + (danger ? "#b8221c" : "#444"),
      }}>{button}</button>
    </div>
  );
}

function MiniStat({ big, small, accent }) {
  return (
    <div style={{
      padding: "10px 16px",
      background: accent ? "var(--accent)" : "transparent",
      color: accent ? "var(--accent-ink)" : "var(--void)",
      borderRight: "2px solid var(--void)",
      textAlign: "center",
    }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, lineHeight: 1 }}>{big}</div>
      <div className="caps" style={{ fontSize: 9, marginTop: 2, opacity: 0.75 }}>{small}</div>
    </div>
  );
}
