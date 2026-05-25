#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appBaseUrl, loadEnv, redactDatabaseUrl, requireEnv } from "./env.js";
import { confirm } from "./prompt.js";
import { getCounts, listMissingCast, listMissingTrailers, withClient } from "./db.js";
import { row, section, table } from "./output.js";
import {
  normalizePriceRunOptions,
  runFullPriceSweep,
  runStalePriceRefresh,
} from "./prices.js";
import { searchMissingTrailers, type TrailerSearchOptions } from "./trailers.js";

const execFileAsync = promisify(execFile);

interface ParsedArgs {
  command: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      command.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const eq = withoutPrefix.indexOf("=");
    if (eq >= 0) {
      flags[withoutPrefix.slice(0, eq)] = withoutPrefix.slice(eq + 1);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags[withoutPrefix] = next;
      i += 1;
    } else {
      flags[withoutPrefix] = true;
    }
  }

  return { command, flags };
}

function boolFlag(flags: Record<string, string | boolean>, name: string): boolean {
  return Boolean(flags[name]);
}

function intFlag(
  flags: Record<string, string | boolean>,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(flags[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

async function git(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: process.cwd() });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function printRepoStatus(): Promise<void> {
  section("Repo");
  row("branch", await git(["branch", "--show-current"]) || "unknown");
  row("clean", (await git(["status", "--short"])) ? "no" : "yes");
  const upstream = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (upstream) {
    const counts = await git(["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
    const [behind, ahead] = counts.split(/\s+/);
    row("ahead", ahead ?? "0");
    row("behind", behind ?? "0");
  }
}

async function printProdStatus(): Promise<void> {
  section("Prod");
  const url = appBaseUrl();
  row("url", url);
  try {
    const res = await fetch(url, { method: "HEAD" });
    row("http", res.status);
  } catch (err) {
    row("http", err instanceof Error ? err.message : "failed");
  }
}

async function printCounts(): Promise<void> {
  await withClient(async (client) => {
    const counts = await getCounts(client);

    section("Catalog");
    row("films", counts.films);
    row("available", counts.available);
    row("retired", counts.retired);
    row("iTunes-backed", counts.itunesBacked);
    row("TMDB-backed", counts.tmdbBacked);

    section("Enrichment");
    row("with streaming providers", counts.withStreamingProviders);
    row("with price history", counts.withPriceHistory);
    row("missing trailer", counts.missingTrailer);
    row("missing cast", counts.missingCast);

    section("Stale");
    row("prices", counts.stalePrices);
    row("streaming", counts.staleStreaming);
  });
}

function formatMissingRows(rows: Array<{
  title: string;
  year: number;
  director: string;
  itunes_id: number | null;
  tmdb_id: number | null;
}>): Array<Record<string, unknown>> {
  return rows.map((film) => ({
    title: film.title,
    year: film.year || "",
    director: film.director || "",
    tmdb_id: film.tmdb_id ?? "",
    itunes_id: film.itunes_id ?? "",
  }));
}

async function printMissing(kind: "trailers" | "cast", flags: Record<string, string | boolean>): Promise<void> {
  const limit = intFlag(flags, "limit", 100, 1, 1000);
  await withClient(async (client) => {
    const rows = kind === "trailers"
      ? await listMissingTrailers(client, limit)
      : await listMissingCast(client, limit);

    section(`Missing ${kind === "trailers" ? "Trailers" : "Cast"}`);
    row("shown", rows.length);
    row("limit", limit);
    table(formatMissingRows(rows));
  });
}

async function status(): Promise<void> {
  console.log("Film Goblin Status");
  await printRepoStatus();
  await printProdStatus();
  await printCounts();
}

async function pricesRun(flags: Record<string, string | boolean>): Promise<void> {
  const options = normalizePriceRunOptions(flags);
  const databaseUrl = requireEnv("DATABASE_URL");
  const yes = boolFlag(flags, "yes");

  await confirm(
    `This will write price-check results to:\n${redactDatabaseUrl(databaseUrl)}`,
    yes,
  );

  await withClient(async (client) => {
    if (options.all) {
      section("Full Price Sweep");
      row("mode", "all tracked iTunes films");
      row("batch size", options.batchSize);
      row("delay between batches", `${options.delayMs}ms`);
      const result = await runFullPriceSweep(client, options);
      const snap = result.digest.snapshot();

      section("Requests");
      row("films in snapshot", result.snapshotSize);
      row("batches", result.batches);
      row("Apple requests", result.appleRequests);

      section("Result");
      row("films refreshed", snap.films_refreshed);
      row("price changes", snap.price_changes);
      row("alerts fired", snap.alerts_fired);
      row("parse failures", snap.parse_failures);
      row("unavailable marked", snap.unavailable_marked);
      row("stopped reason", snap.stopped_reason);
      if (snap.parse_failure_ids.length > 0) {
        row("parse failure IDs", snap.parse_failure_ids.join(", "));
      }
      return;
    }

    section("Stale Price Refresh");
    row("batch size", options.batchSize);
    row("max films", options.maxFilms);
    row("runtime budget", `${options.maxRuntimeMs}ms`);
    row("stale hours", options.staleHours);
    const digest = await runStalePriceRefresh(client, options);
    const snap = digest.snapshot();

    section("Result");
    row("films refreshed", snap.films_refreshed);
    row("price changes", snap.price_changes);
    row("alerts fired", snap.alerts_fired);
    row("parse failures", snap.parse_failures);
    row("unavailable marked", snap.unavailable_marked);
    row("stopped reason", snap.stopped_reason);
  });
}

function normalizeTrailerSearchOptions(flags: Record<string, string | boolean>): TrailerSearchOptions {
  const threshold = Number(flags.threshold);
  return {
    limit: intFlag(flags, "limit", 25, 1, 200),
    threshold: Number.isFinite(threshold) ? Math.max(0, Math.min(1, threshold)) : 0.88,
    delayMs: intFlag(flags, "delay-ms", 1000, 0, 60_000),
    write: boolFlag(flags, "write"),
    yes: boolFlag(flags, "yes"),
  };
}

async function trailersSearchMissing(flags: Record<string, string | boolean>): Promise<void> {
  const options = normalizeTrailerSearchOptions(flags);
  if (options.write) {
    await confirm(
      `This will write machine-found YouTube trailers to:\n${redactDatabaseUrl(requireEnv("DATABASE_URL"))}`,
      options.yes,
    );
  }

  await withClient(async (client) => {
    section("Trailer Search");
    row("limit", options.limit);
    row("threshold", options.threshold);
    row("delay", `${options.delayMs}ms`);
    row("mode", options.write ? "write" : "dry-run");

    const result = await searchMissingTrailers(client, options);
    for (const item of result.rows) {
      const filmLabel = `${item.film.title} (${item.film.year || "unknown"})`;
      console.log("");
      console.log(filmLabel);
      if (!item.candidate) {
        row("action", item.action);
        if (item.error) row("error", item.error);
        continue;
      }
      row("best", item.candidate.title);
      row("url", item.candidate.url);
      row("score", item.candidate.score.toFixed(2));
      row("action", item.action);
      row("reasons", item.candidate.reasons.join(", "));
      if (item.error) row("error", item.error);
    }

    section("Result");
    row("scanned", result.scanned);
    row("candidates found", result.candidatesFound);
    row("written", result.written);
    row("below threshold", result.belowThreshold);
    row("no candidates", result.noCandidates);
    row("failed", result.failed);
  });
}

function help(): void {
  console.log(`fg-maint

Usage:
  fg-maint status
  fg-maint db counts
  fg-maint missing trailers [--limit 100]
  fg-maint missing cast [--limit 100]
  fg-maint trailers search-missing [options]
  fg-maint prices run [options]

Commands:
  status                Show repo, production, and database health
  db counts             Show catalog/enrichment/staleness counts
  missing trailers      List available films with no trailer_youtube_id
  missing cast          List available films with no film_cast rows
  trailers search-missing
                        Search YouTube via Brave for missing trailers
  prices run            Run a price refresh against the configured database

Trailer search options:
  --limit 25            Number of missing-trailer films to scan
  --threshold 0.88      Minimum score required to save
  --delay-ms 1000       Delay between Brave searches
  --write               Write high-confidence matches to films
  --yes                 Skip confirmation for write mode

Price options:
  --all                 Full local sweep: check every tracked film with an iTunes ID once
  --batch-size 100      iTunes lookup batch size, max 100
  --delay-ms 2000       Delay between Apple lookup batches
  --max-attempts 4      Retry attempts per Apple lookup batch
  --budget-ms 240000    Runtime budget for stale mode only
  --stale-hours 20      Staleness cutoff for stale mode only
  --max-films 10000     Max films for stale mode only
  --yes                 Skip confirmation

Examples:
  fg-maint status
  fg-maint db counts
  fg-maint missing trailers
  fg-maint missing cast --limit 200
  fg-maint trailers search-missing --limit 10
  fg-maint trailers search-missing --limit 10 --threshold 0.92 --write
  fg-maint prices run --all
  fg-maint prices run --all --yes
  fg-maint prices run --all --batch-size 50 --delay-ms 3000 --yes

Shortcut note:
  --all belongs after "prices run"; use "fg-maint prices run --all", not "fg-maint --all".
`);
}

async function main(): Promise<void> {
  loadEnv();
  const { command, flags } = parseArgs(process.argv.slice(2));
  const [a, b] = command;

  if (flags.all && command.length === 0) {
    console.error("Did you mean: fg-maint prices run --all");
    console.error("");
    help();
    process.exitCode = 1;
    return;
  }
  if (!a || a === "help" || a === "--help") {
    help();
    return;
  }
  if (a === "status") {
    await status();
    return;
  }
  if (a === "db" && b === "counts") {
    await printCounts();
    return;
  }
  if (a === "missing" && (b === "trailers" || b === "cast")) {
    await printMissing(b, flags);
    return;
  }
  if (a === "trailers" && b === "search-missing") {
    await trailersSearchMissing(flags);
    return;
  }
  if (a === "prices" && b === "run") {
    await pricesRun(flags);
    return;
  }

  help();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
