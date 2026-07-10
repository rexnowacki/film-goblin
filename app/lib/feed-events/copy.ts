// Pure copy templates for system feed events (spec 2026-07-05 "The Living Pit").
// Copy is rendered ONCE at emission time and stored in feed_events.copy —
// editing these templates never rewrites history. Emoji is part of the string.

export type FeedEventType =
  | "price_drop" | "all_time_low" | "price_rise" | "new_film"
  | "anniversary" | "goblin_pick" | "milestone"
  | "left_free" | "now_free" | "now_on_apple" | "last_showing"
  | "verdict_anointed" | "now_at_theater" | "full_moon" | "monthly_communion";

export const EVENT_PRIORITY: Record<FeedEventType, number> = {
  all_time_low: 100,
  price_drop: 90,
  goblin_pick: 80,
  new_film: 70,
  price_rise: 60,
  milestone: 50,
  anniversary: 10,
  left_free: 88,
  now_free: 85,
  now_on_apple: 82,
  last_showing: 78,
  verdict_anointed: 75,
  now_at_theater: 65,
  full_moon: 45,
  monthly_communion: 40,
};

export interface CopyVars {
  title?: string;
  year?: number;
  price?: number;
  old_price?: number;
  n?: number;
  age?: number;
  one_line?: string;
  milestone_kind?: "catalog" | "monthly" | "member";
  service?: string;
  theater?: string;
  summoned?: boolean;
}

function usd(v: number | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `$${v.toFixed(2)}` : "a new low";
}

type Template = (v: CopyVars) => string;

// Voice rule: goblin ACTION verb first, then the concrete fact — never a
// goblin FEELING. "The goblin gnawed off the price tag. X is free." is
// good; "The goblin mourns. X was taken back." is bad (states a feeling,
// not an action). Apply this to any new template added below.
const TEMPLATES: Record<Exclude<FeedEventType, "milestone">, Template[]> = {
  price_drop: [
    v => `The blood price falls. **${v.title}** is now ${usd(v.price)} — down from ${usd(v.old_price)}.`,
    v => `Apple blinked. **${v.title}** drops to ${usd(v.price)}.`,
    v => `The goblin marked **${v.title}**'s fall to ${usd(v.price)}. Now you know too.`,
    v => `The goblin dragged **${v.title}** back from the void at ${usd(v.price)}. It was ${usd(v.old_price)}.`,
  ],
  all_time_low: [
    v => `ALL-TIME LOW: **${v.title}** at ${usd(v.price)}. The moon is right. The price is finally right too.`,
    v => `**${v.title}** drops its guard to ${usd(v.price)}. The goblin strikes.`,
    v => `The goblin waited years in the dark for this. **${v.title}**: ${usd(v.price)}. All-time low.`,
  ],
  price_rise: [
    v => `The window closes. **${v.title}** climbs back to ${usd(v.price)}. You were warned.`,
    v => `**${v.title}** rises to ${usd(v.price)}. The patient will be rewarded. Eventually.`,
  ],
  new_film: [
    v => `The goblin dragged **${v.title}** (${v.year}) into the pit by the collar.`,
    v => `Fresh from the pit: **${v.title}** (${v.year}) joins the hoard.`,
    v => `The goblin sank its claws into **${v.title}** (${v.year}) and hauled it down into the pit.`,
    v => `The goblin returned from the surface with **${v.title}** (${v.year}) clenched in its teeth.`,
  ],
  anniversary: [
    v => `**${v.title}** turns ${v.age} today. It has not mellowed.`,
    v => `On this night in ${v.year}, **${v.title}** was released. Burn something.`,
    v => `${v.age} years of **${v.title}**. The mothers do not age.`,
    v => `The goblin unearthed **${v.title}**'s bones. ${v.age} years old today. Still warm.`,
  ],
  goblin_pick: [
    v => `The goblin's counsel this week: **${v.title}** (${v.year}). ${v.one_line ?? ""}`.trim(),
  ],
  left_free: [
    v => `**${v.title}** has left ${v.service}. The free ride is over — the goblin still tracks the price.`,
    v => `The goblin let **${v.title}** slip back to ${v.service}'s vault. Still watching the price.`,
  ],
  now_free: [
    v => `**${v.title}** is free on ${v.service}. No tithe required. Go.`,
    v => `${v.service} offers **${v.title}** for nothing. Suspicious. Take it anyway.`,
    v => `The goblin pried the lock off ${v.service}'s vault. **${v.title}** costs nothing tonight.`,
  ],
  now_on_apple: [
    v => `The theatrical veil lifts. **${v.title}** crosses over — now on Apple TV.`,
    v => `The wait ends. **${v.title}** is on Apple TV. The pit tracks its price from tonight.`,
  ],
  last_showing: [
    v => `Tonight is the last showing of **${v.title}** at ${v.theater}. Then: the small screen, and regret.`,
    v => `Final night for **${v.title}** at ${v.theater}. The projector forgets; the goblin does not.`,
  ],
  verdict_anointed: [
    v => `The coven has spoken. **${v.title}** is Anointed.`,
    v => `Ninety percent of the coven cannot be wrong. **${v.title}** ascends.`,
    v => `The goblin carried **${v.title}** up from the pit on its shoulders. Anointed by the coven.`,
  ],
  now_at_theater: [
    v => `**${v.title}** haunts ${v.theater} this week. The big screen is the proper altar.`,
    v => `${v.theater} summons **${v.title}**. Attend.`,
  ],
  full_moon: [
    v => `The moon is full. The pit suggests **${v.title}**. Lock the doors either way.`,
    v => `Full moon tonight. **${v.title}** knows what that means.`,
  ],
  monthly_communion: [
    v => `The coven gathered around **${v.title}** this month — ${v.n} watchings.`,
  ],
};

const MILESTONE_TEMPLATES: Record<NonNullable<CopyVars["milestone_kind"]>, Template[]> = {
  catalog: [
    v => `The pit now holds ${v.n} films. The hoard grows.`,
    v => `The goblin counted the hoard on its fingers, then its toes, then borrowed yours. ${v.n} films.`,
  ],
  monthly: [
    v => {
      const base = `The coven watched ${v.n} films together this month.`;
      return v.n === 13 || v.n === 66 || v.n === 666 ? `${base} Appropriate.` : base;
    },
  ],
  member: [v => `Coven member ${v.n} has signed the book. Welcome.`],
};

/**
 * Copy stored before 2026-07-06 opens with an emoji (the templates carried
 * them until the FROM THE PIT tag took over that job). Stored copy is frozen
 * by design, so old rows are groomed at render time instead of rewritten.
 */
export function stripLeadingEmoji(copy: string): string {
  return copy.replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+\s*/u, "");
}

export function variantCount(type: FeedEventType, vars?: CopyVars): number {
  if (type === "milestone") {
    return MILESTONE_TEMPLATES[vars?.milestone_kind ?? "catalog"].length;
  }
  return TEMPLATES[type].length;
}

export function renderCopy(type: FeedEventType, vars: CopyVars, variant: number): string {
  if (type === "new_film" && vars.summoned) {
    return `The summons was answered. **${vars.title}** claws its way into the pit.`;
  }
  if (type === "milestone") {
    const kind = vars.milestone_kind ?? "catalog";
    const list = MILESTONE_TEMPLATES[kind];
    const idx = Math.min(Math.max(variant, 0), list.length - 1);
    return list[idx](vars);
  }
  const list = TEMPLATES[type];
  const idx = Math.min(Math.max(variant, 0), list.length - 1);
  return list[idx](vars);
}

/** Pick a variant index, never repeating prevVariant when >1 variant exists. */
export function pickVariant(
  type: FeedEventType,
  vars: CopyVars,
  prevVariant: number | null,
  rand: () => number,
): number {
  const count = variantCount(type, vars);
  if (count <= 1) return 0;
  const pool = Array.from({ length: count }, (_, i) => i).filter(i => i !== prevVariant);
  return pool[Math.floor(rand() * pool.length)];
}
