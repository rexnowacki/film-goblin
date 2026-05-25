import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

export function loadEnv(): void {
  for (const file of [".env.local", "app/.env.local", "tools/fg-maint/.env.local"]) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) dotenv.config({ path, override: false });
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

export function appBaseUrl(): string {
  return process.env.APP_BASE_URL || "https://freshfromthepit.com";
}

export function redactDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = "****";
    if (url.username) url.username = `${url.username.slice(0, 3)}...`;
    return url.toString();
  } catch {
    return raw.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
  }
}
