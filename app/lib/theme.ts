export const THEMES = ["pink-goblin", "midsommar"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "fg_theme";
export const DEFAULT_THEME: Theme = "pink-goblin";

export function isTheme(v: string | null | undefined): v is Theme {
  return !!v && (THEMES as readonly string[]).includes(v);
}

export function readTheme(value: string | null | undefined): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

export const THEME_LABELS: Record<Theme, string> = {
  "pink-goblin": "Pink Goblin",
  midsommar: "Midsommar",
};
