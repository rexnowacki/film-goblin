import { useState, useEffect } from "react";
import LandingPage from "./pages/LandingPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import FilmDetailPage from "./pages/FilmDetailPage.jsx";
import DealsPage from "./pages/DealsPage.jsx";
import FilmsPage from "./pages/FilmsPage.jsx";
import ListsPage from "./pages/ListsPage.jsx";
import FriendsPage from "./pages/FriendsPage.jsx";
import ListDetailPage from "./pages/ListDetailPage.jsx";
import OnboardingFlow from "./pages/OnboardingFlow.jsx";
import AlertsPage from "./pages/AlertsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import MobilePage from "./pages/MobilePage.jsx";

const TWEAK_DEFAULTS = {
  accent: "pink",
  texture: "medium",
  wordmarkWobble: false,
  halftone: true,
  invertLanding: false,
};

const ROUTES = [
  { id: "landing", label: "Landing" },
  { id: "home", label: "Home" },
  { id: "deals", label: "Deals" },
  { id: "films", label: "Films" },
  { id: "lists", label: "Lists" },
  { id: "friends", label: "Friends" },
  { id: "film", label: "Film Detail" },
  { id: "list", label: "List Detail" },
  { id: "onboarding", label: "Onboarding" },
  { id: "alerts", label: "Alerts" },
  { id: "settings", label: "Settings" },
  { id: "mobile", label: "Mobile" },
];

const ACCENTS = [
  { id: "pink", color: "#ff2d88" },
  { id: "yellow", color: "#f5d300" },
  { id: "orange", color: "#ff6a1f" },
  { id: "blood", color: "#d93a2e" },
];

export default function App() {
  const [route, setRoute] = useState(() => {
    try { return localStorage.getItem("fg_route") || "landing"; } catch { return "landing"; }
  });
  const [filmId, setFilmId] = useState(() => {
    try { return localStorage.getItem("fg_film") || "midsommar"; } catch { return "midsommar"; }
  });
  const [listId, setListId] = useState(() => {
    try { return localStorage.getItem("fg_list") || "folk-terror"; } catch { return "folk-terror"; }
  });
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => { try { localStorage.setItem("fg_route", route); } catch {} }, [route]);
  useEffect(() => { try { localStorage.setItem("fg_film", filmId); } catch {} }, [filmId]);
  useEffect(() => { try { localStorage.setItem("fg_list", listId); } catch {} }, [listId]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", tweaks.accent);
  }, [tweaks.accent]);

  const setTweak = (key, val) => setTweaks(prev => ({ ...prev, [key]: val }));
  const navigate = (r, id) => {
    if (r === "list" && id) setListId(id);
    setRoute(r);
  };
  const openFilm = id => { setFilmId(id); setRoute("film"); };

  return (
    <div data-accent={tweaks.accent} style={{ minHeight: "100vh" }}>
      <div style={{
        position: "fixed", top: 10, left: 10, zIndex: 50,
        display: "flex", gap: 4, flexWrap: "wrap", maxWidth: "calc(100vw - 20px)",
        background: "var(--void)", border: "2px solid var(--accent)",
        padding: 3,
        boxShadow: "3px 3px 0 var(--accent)",
      }}>
        {ROUTES.map(r => (
          <button key={r.id} onClick={() => setRoute(r.id)} style={{
            background: route === r.id ? "var(--accent)" : "transparent",
            color: route === r.id ? "var(--accent-ink)" : "var(--bone)",
            border: "0",
            padding: "4px 10px",
            fontSize: 10,
            fontFamily: "var(--font-ui)",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}>{r.label}</button>
        ))}
      </div>

      <button
        onClick={() => setTweaksOpen(o => !o)}
        aria-label="Toggle tweaks panel"
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 10000,
          background: "var(--accent)", color: "var(--accent-ink)",
          border: "2px solid var(--void)", boxShadow: "3px 3px 0 var(--void)",
          width: 44, height: 44,
          fontFamily: "var(--font-display)", fontSize: 22, cursor: "pointer",
          display: tweaksOpen ? "none" : "grid", placeItems: "center", lineHeight: 1,
        }}
      >✦</button>

      {route === "landing" && <LandingPage onNavigate={navigate} />}
      {route === "home" && <HomePage onNavigate={navigate} onOpenFilm={openFilm} />}
      {route === "film" && <FilmDetailPage filmId={filmId} onNavigate={navigate} onOpenFilm={openFilm} />}
      {route === "deals" && <DealsPage onNavigate={navigate} onOpenFilm={openFilm} />}
      {route === "films" && <FilmsPage onNavigate={navigate} onOpenFilm={openFilm} />}
      {route === "lists" && <ListsPage onNavigate={navigate} onOpenFilm={openFilm} />}
      {route === "friends" && <FriendsPage onNavigate={navigate} onOpenFilm={openFilm} />}
      {route === "list" && <ListDetailPage listId={listId} onNavigate={navigate} onOpenFilm={openFilm} />}
      {route === "onboarding" && <OnboardingFlow onNavigate={navigate} />}
      {route === "alerts" && <AlertsPage onNavigate={navigate} onOpenFilm={openFilm} />}
      {route === "settings" && <SettingsPage onNavigate={navigate} />}
      {route === "mobile" && <MobilePage onNavigate={navigate} />}

      {tweaksOpen && (
        <div className="tweaks-panel">
          <button
            onClick={() => setTweaksOpen(false)}
            aria-label="Close tweaks"
            style={{
              position: "absolute", top: 6, right: 8,
              background: "transparent", border: 0, cursor: "pointer",
              fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1,
              color: "var(--void)",
            }}
          >×</button>
          <h3>Tweaks</h3>

          <div style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Accent Ink</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
              {ACCENTS.map(c => (
                <button key={c.id} onClick={() => setTweak("accent", c.id)} style={{
                  height: 32,
                  background: c.color,
                  border: "2px solid " + (tweaks.accent === c.id ? "var(--void)" : "transparent"),
                  cursor: "pointer",
                  position: "relative",
                }}>
                  {tweaks.accent === c.id && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--void)", fontWeight: 900 }}>✦</span>}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, marginTop: 6, opacity: 0.7 }}>
              Pink · Yellow · Orange · Blood
            </div>
          </div>

          <div style={{ borderTop: "1.5px dashed var(--void)", paddingTop: 12, marginBottom: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Surprise Knobs</div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12 }}>
              <input type="checkbox" checked={tweaks.wordmarkWobble} onChange={e => setTweak("wordmarkWobble", e.target.checked)} />
              Wordmark wobble (animate drip)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12 }}>
              <input type="checkbox" checked={tweaks.halftone} onChange={e => setTweak("halftone", e.target.checked)} />
              Halftone dots
            </label>
          </div>

          <div style={{ borderTop: "1.5px dashed var(--void)", paddingTop: 10, fontSize: 10, fontStyle: "italic", fontFamily: "var(--font-serif)", opacity: 0.7 }}>
            Changes persist within this session.
          </div>
        </div>
      )}

      <style>{`
        ${tweaks.wordmarkWobble ? `
          @keyframes fgDrip {
            0%, 100% { transform: translateY(0) skewX(0deg); }
            50% { transform: translateY(2px) skewX(-0.8deg); }
          }
          .display { animation: fgDrip 4.2s ease-in-out infinite; }
        ` : ""}
        ${!tweaks.halftone ? `
          [style*="radial-gradient"] { background-image: none !important; }
          .halftone, .halftone-lg, .halftone-xl { background-image: none !important; }
        ` : ""}
      `}</style>
    </div>
  );
}
