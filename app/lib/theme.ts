export const THEMES = ["pink-goblin", "goblin-print"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "fg_theme";
export const DEFAULT_THEME: Theme = "pink-goblin";

export function isTheme(v: string | null | undefined): v is Theme {
  return !!v && (THEMES as readonly string[]).includes(v);
}

export function readTheme(value: string | null | undefined): Theme {
  // Midsommar was retired in July 2026. Preserve the stored choice by
  // migrating its cookie value at the read boundary; the picker and action
  // only expose canonical themes, so the legacy value is never written again.
  if (value === "midsommar") return "goblin-print";
  return isTheme(value) ? value : DEFAULT_THEME;
}

export const THEME_LABELS: Record<Theme, string> = {
  "pink-goblin": "Pink Goblin",
  "goblin-print": "Goblin Print",
};
