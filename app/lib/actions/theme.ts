"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { THEME_COOKIE, isTheme, type Theme } from "@/lib/theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setTheme(theme: Theme) {
  if (!isTheme(theme)) throw new Error("invalid theme");
  const c = await cookies();
  c.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
