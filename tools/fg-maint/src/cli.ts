#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appBaseUrl, loadEnv, redactDatabaseUrl, requireEnv } from "./env.js";
import { confirm } from "./prompt.js";
import { getCounts, withClient } from "./db.js";
import { row, section } from "./output.js";
import {
  normalizePriceRunOptions,
  runFullPriceSweep,
  runStalePriceRefresh,
} from "./prices.js";

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

function help(): void {
  console.log(`fg-maint

Usage:
  npm run fg -- status
  npm run fg -- db counts
  npm run fg -- prices run [--all] [--yes]

Price options:
  --all                 Check every tracked film with an iTunes ID once
  --batch-size 100      iTunes lookup batch size, max 100
  --delay-ms 2000       Delay between Apple lookup batches
  --max-attempts 4      Retry attempts per Apple lookup batch
  --budget-ms 240000    Runtime budget for stale mode
  --stale-hours 20      Staleness cutoff for stale mode
  --max-films 10000     Max films for stale mode
  --yes                 Skip confirmation
`);
}

async function main(): Promise<void> {
  loadEnv();
  const { command, flags } = parseArgs(process.argv.slice(2));
  const [a, b] = command;

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
