export const FILMS = [
  { id: "midsommar", title: "Midsommar", year: 2019, director: "Ari Aster", runtime: 147, rating: 7.1, bg: "#0a0a0a", fg: "#f3ecd8", accent: "#f5d300", shape: "triangle", titleFont: "head", case: "upper",
    overview: "A grief-stricken couple travels to Sweden for a midsummer festival hosted by a remote pagan commune. The sun never sets. Neither does the dread.",
    genres: ["Folk Horror", "Drama"], prices: [{ store: "Apple TV", current: 4.99, was: 14.99 }, { store: "iTunes", current: 4.99, was: 14.99 }] },
  { id: "hereditary", title: "Hereditary", year: 2018, director: "Ari Aster", runtime: 127, rating: 7.3, bg: "#1a1a1a", fg: "#f3ecd8", accent: "#ff2d88", shape: "skull",
    overview: "After the family matriarch passes away, her daughter's family begins to unravel cryptic and increasingly terrifying secrets about their ancestry.",
    genres: ["Horror", "Mystery"], prices: [{ store: "Apple TV", current: 3.99, was: 12.99 }, { store: "iTunes", current: 3.99, was: 12.99 }] },
  { id: "skinamarink", title: "Skinamarink", year: 2022, director: "Kyle E. Ball", runtime: 100, rating: 6.1, bg: "#0a0a0a", fg: "#e8dfc4", accent: "#8a8578", shape: "bars",
    overview: "Two children wake in the middle of the night to find their father missing and all the windows and doors in their home vanished.",
    genres: ["Experimental Horror"], prices: [{ store: "Apple TV", current: 2.99, was: 9.99 }, { store: "iTunes", current: 2.99, was: 9.99 }] },
  { id: "witch", title: "The VVitch", year: 2015, director: "Robert Eggers", runtime: 92, rating: 6.9, bg: "#1c1c1c", fg: "#f3ecd8", accent: "#b8221c", shape: "cross", case: "upper",
    overview: "A family in 1630s New England is torn apart by the forces of witchcraft, black magic, and possession.",
    genres: ["Folk Horror", "Period"], prices: [{ store: "Apple TV", current: 4.99, was: 13.99 }, { store: "iTunes", current: 4.99, was: 13.99 }] },
  { id: "lighthouse", title: "The Lighthouse", year: 2019, director: "Robert Eggers", runtime: 109, rating: 7.4, bg: "#141414", fg: "#e8dfc4", accent: "#f5d300", shape: "circle",
    overview: "Two lighthouse keepers try to maintain their sanity while living on a remote and mysterious New England island in the 1890s.",
    genres: ["Psychological Horror"], prices: [{ store: "Apple TV", current: 5.99, was: 14.99 }, { store: "iTunes", current: 5.99, was: 14.99 }] },
  { id: "suspiria", title: "Suspiria", year: 2018, director: "Luca Guadagnino", runtime: 152, rating: 6.8, bg: "#b8221c", fg: "#f3ecd8", accent: "#0a0a0a", shape: "eye", titleFont: "display",
    overview: "A darkness swirls at the center of a world-renowned dance company, one that will engulf the troupe's matron, an ambitious young American, and a grieving psychotherapist.",
    genres: ["Horror", "Mystery"], prices: [{ store: "Apple TV", current: 3.99, was: 12.99 }, { store: "iTunes", current: 3.99, was: 12.99 }] },
  { id: "babadook", title: "The Babadook", year: 2014, director: "Jennifer Kent", runtime: 94, rating: 6.8, bg: "#0a0a0a", fg: "#f3ecd8", accent: "#f5d300", shape: "triangle",
    overview: "A single mother and her child fall into a deep well of paranoia when an eerie children's book titled 'Mister Babadook' manifests in their home.",
    genres: ["Psychological Horror"], prices: [{ store: "Apple TV", current: 2.99, was: 9.99 }] },
  { id: "saintmaud", title: "Saint Maud", year: 2019, director: "Rose Glass", runtime: 84, rating: 6.7, bg: "#2a1a1a", fg: "#f3ecd8", accent: "#ff2d88", shape: "cross",
    overview: "A newly devout hospice nurse becomes obsessed with saving the soul of her dying patient.",
    genres: ["Religious Horror"], prices: [{ store: "Apple TV", current: 3.99, was: 11.99 }] },
  { id: "mandy", title: "Mandy", year: 2018, director: "Panos Cosmatos", runtime: 121, rating: 6.5, bg: "#3a0f2e", fg: "#f5d300", accent: "#ff2d88", shape: "eye", case: "upper",
    overview: "The enchanted lives of a couple in a secluded forest are brutally shattered by a nightmarish hippie cult and their demon-biker henchmen.",
    genres: ["Revenge", "Psychedelic"], prices: [{ store: "Apple TV", current: 4.99, was: 14.99 }] },
  { id: "greenknight", title: "The Green Knight", year: 2021, director: "David Lowery", runtime: 130, rating: 6.6, bg: "#1a2a1a", fg: "#f3ecd8", accent: "#f5d300", shape: "circle",
    overview: "A fantasy retelling of the medieval story of Sir Gawain and the Green Knight.",
    genres: ["Fantasy", "Folk"], prices: [{ store: "Apple TV", current: 3.99, was: 13.99 }] },
  { id: "xx", title: "X", year: 2022, director: "Ti West", runtime: 105, rating: 6.5, bg: "#0a0a0a", fg: "#f5d300", accent: "#b8221c", shape: "bars", case: "upper",
    overview: "In 1979, a group of young filmmakers set out to make an adult film in rural Texas, but when their reclusive elderly hosts catch them in the act, the cast finds themselves fighting for their lives.",
    genres: ["Slasher"], prices: [{ store: "Apple TV", current: 4.99, was: 14.99 }] },
  { id: "pearl", title: "Pearl", year: 2022, director: "Ti West", runtime: 103, rating: 6.9, bg: "#b8221c", fg: "#f5d300", accent: "#0a0a0a", shape: "eye", case: "upper",
    overview: "A young woman trapped on her family's isolated farm must tend to her ailing father under the bitter and overbearing watch of her devout mother.",
    genres: ["Slasher"], prices: [{ store: "Apple TV", current: 4.99, was: 12.99 }] },
  { id: "itfollows", title: "It Follows", year: 2014, director: "David Robert Mitchell", runtime: 100, rating: 6.8, bg: "#141414", fg: "#f3ecd8", accent: "#ff2d88", shape: "circle",
    overview: "A young woman is followed by an unknown supernatural force after a sexual encounter.",
    genres: ["Horror"], prices: [{ store: "Apple TV", current: 2.99, was: 9.99 }] },
  { id: "thing", title: "The Thing", year: 1982, director: "John Carpenter", runtime: 109, rating: 8.2, bg: "#0a0a0a", fg: "#e8dfc4", accent: "#b8221c", shape: "triangle",
    overview: "A research team in Antarctica is hunted by a shape-shifting alien that assumes the appearance of its victims.",
    genres: ["Sci-Fi Horror", "Classic"], prices: [{ store: "Apple TV", current: 4.99, was: 14.99 }] },
  { id: "cure", title: "Cure", year: 1997, director: "Kiyoshi Kurosawa", runtime: 111, rating: 7.5, bg: "#1a1a1a", fg: "#f3ecd8", accent: "#f5d300", shape: "cross",
    overview: "A wave of gruesome murders is sweeping Tokyo. Each victim has a fresh x-shaped gash carved into their necks, and the killer is always near.",
    genres: ["Psychological", "J-Horror"], prices: [{ store: "Apple TV", current: 5.99, was: 14.99 }] },
];

export const FILM_BY_ID = Object.fromEntries(FILMS.map(f => [f.id, f]));

export const LISTS = [
  { id: "folk-terror", title: "Folk Terror", curator: "moss.witch", count: 23, films: ["midsommar", "witch", "greenknight", "saintmaud"], bg: "#0a0a0a", accent: "#f5d300" },
  { id: "watched-at-3am", title: "Films I Watched At 3AM And Regretted", curator: "doomslug", count: 14, films: ["skinamarink", "hereditary", "cure", "babadook"], bg: "#b8221c", accent: "#0a0a0a" },
  { id: "eggers-complete", title: "The Complete Eggers", curator: "candleflesh", count: 4, films: ["witch", "lighthouse"], bg: "#e8dfc4", fg: "#0a0a0a", accent: "#ff2d88" },
  { id: "a24-canon", title: "A24's Unholy Canon", curator: "filmgoblin", count: 47, films: ["midsommar", "hereditary", "witch", "lighthouse", "saintmaud"], bg: "#ff2d88", fg: "#0a0a0a", accent: "#f5d300", official: true },
  { id: "slow-burn", title: "Slow Burn, Faster Dread", curator: "ash.dovecote", count: 18, films: ["itfollows", "babadook", "cure"], bg: "#1a2a1a", accent: "#f5d300" },
  { id: "video-nasty", title: "Video Nasty Revival", curator: "bloodyreel", count: 31, films: ["xx", "pearl", "thing"], bg: "#f5d300", fg: "#0a0a0a", accent: "#b8221c" },
];

export const USERS = [
  { handle: "moss.witch", name: "Moss Witch", color: "#3a5f3a", reviews: 412, followers: 1823 },
  { handle: "doomslug", name: "Doom Slug", color: "#ff2d88", reviews: 287, followers: 944 },
  { handle: "candleflesh", name: "Candle Flesh", color: "#f5d300", reviews: 156, followers: 2104 },
  { handle: "ash.dovecote", name: "Ash Dovecote", color: "#b8221c", reviews: 88, followers: 412 },
  { handle: "bloodyreel", name: "Bloody Reel", color: "#7a4e9e", reviews: 523, followers: 3211 },
  { handle: "tallow.jones", name: "Tallow Jones", color: "#ff6a1f", reviews: 71, followers: 188 },
  { handle: "gristleburn", name: "Gristle Burn", color: "#3a5f3a", reviews: 244, followers: 612 },
];

export const ACTIVITY = [
  { type: "review", user: "moss.witch", film: "midsommar", rating: 9, body: "communal grief as a crop rotation. i've been thinking about the may queen for six years. it's still not over.", likes: 344, time: "2h" },
  { type: "recommend", user: "doomslug", film: "saintmaud", toYou: true, body: "this one's for you. sent it during an eclipse on purpose.", time: "4h" },
  { type: "watchlist", user: "candleflesh", film: "cure", time: "5h" },
  { type: "review", user: "ash.dovecote", film: "hereditary", rating: 8, body: "i watched this with my mother. we have not spoken since.", likes: 211, time: "6h" },
  { type: "review", user: "bloodyreel", film: "xx", rating: 7, body: "a love letter to the grindhouse, written in lipstick on a motel mirror.", likes: 102, time: "8h" },
  { type: "list", user: "moss.witch", list: "folk-terror", time: "12h" },
  { type: "recommend", user: "gristleburn", film: "pearl", toUser: "tallow.jones", time: "14h" },
];

export function genPriceHistory(seed, current, was) {
  const pts = [];
  const now = Date.now();
  const days = 180;
  let price = was;
  for (let i = 0; i < days; i++) {
    const t = now - (days - i) * 86400000;
    const r = Math.sin(seed + i * 0.7) * 0.5 + Math.sin(seed * 3.1 + i * 0.13) * 0.5;
    if (i > days - 20) price = current;
    else if (i > days - 40) price = was * (0.6 + r * 0.15);
    else price = was * (0.85 + r * 0.12);
    price = Math.max(current, Math.min(was, Math.round(price * 100) / 100));
    pts.push({ t, price });
  }
  pts[pts.length - 1].price = current;
  return pts;
}
