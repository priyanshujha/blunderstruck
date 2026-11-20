#!/usr/bin/env node
import { once } from "node:events";
import { type WriteStream, createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import {
  COACH_ROUTES,
  ConfigError,
  NO_KEY_MESSAGE,
  anthropicProvider,
  geminiProvider,
  resolveProvider,
  type CoachProvider,
} from "@blunderstruck/coach";
import {
  type AnalyzedGame,
  GameRecord,
  Platform,
  RatingBand,
  type WeeklyReport,
  perspective,
} from "@blunderstruck/contracts";
import { UciEngine, analyzeGame } from "@blunderstruck/engine";
import { fetchGames } from "@blunderstruck/ingest";
import { summarize, toPlayerGame, type PlayerGame } from "@blunderstruck/patterns";
import { MAX_LOOKBACK_DAYS, MIN_REPORT_GAMES } from "@blunderstruck/progress";
import { AnalysisAborted, ReportInputError, runReport } from "@blunderstruck/report";
import { exportStore, importStore, openSqliteStore } from "@blunderstruck/store";
import { defaultCachePath, loadCache, mergeCache, needsEngine, planCache, saveCache } from "./analysis-cache";
import { MAX_DEPTH, intOption, parseDbArgs, parseReportArgs, type ReportArgs } from "./args";
import { dbPath } from "./db-path";
import { EnvFileError, loadEnv } from "./env";
import { formatPatterns } from "./patterns-format";
import { formatReport } from "./report-format";

const USAGE = `blunderstruck <command>

  fetch <lichess|chesscom> <username> [--max 20] [--since 2026-11-01] [--out data/games.json]
      Pull recent finished standard games and write them as normalised JSON.

  analyze <games.json> --player <username> [--index 0] [--depth 12] [--out file.json]
      Run Stockfish over one game and list the player's inaccuracies, mistakes and blunders.

  patterns <games.json> --player <username> [--max N] [--depth 12] [--analyses <file>]
           [--examples 2] [--all] [--json]
      Find the player's recurring mistakes and lead with the top habits
      (every pattern is still counted; --all lists them).
      Analyses are saved to <games>.analyses.json (or --analyses) and reused when the
      analysis version and depth match; only new or outdated games go through Stockfish.
      --max N        use the player's first N games in the file
      --examples N   example positions per habit (0-2)
      --all          also print every pattern and the repeated opening mistakes
      --json         print the full pattern summary as JSON on stdout (progress on stderr)

  report <lichess|chesscom> <username> [--time-class <class>] [--depth 12] [--db <path>]
         [--provider anthropic|gemini|none] [--env <path>] [--band <band>]
         [--as-of <ISO date>] [--now] [--sample-only] [--max-games N] [--json] [--all]
      Fetch the games played since the last report, analyse them, and print what to work on
      and how the previous focus items moved. Games and reports are kept in a local database.
      A large period is analysed as a sample first; the rest follows in the same run and can
      be stopped with Ctrl-C at any time (run report again to continue).
      --time-class   bullet, blitz, rapid or classical (default: the track used before, or
                     the class with the most recent rated games)
      --db           database file (default: $BLUNDERSTRUCK_DB, else ~/.blunderstruck/blunderstruck.db)
      --provider     model used for the wording; none prints numbers with template text
      --env          read settings from this file (default: ./.env when present); variables
                     already set in the environment win
      --band         rating band to coach for: ${RatingBand.options.join(", ")}
      --as-of        end the period at this time instead of now
      --now          make a new report even with fewer than ${MIN_REPORT_GAMES} new games
      --sample-only  stop after the sample; a later run finishes the analysis
      --max-games N  analyse at most N of the period's games
      --json         print the stored report as JSON on stdout (messages on stderr)
      --all          also print the week-by-week table and every pattern's trend

  db export <file> [--db <path>] [--force] [--env <path>]
      Write the whole database as NDJSON (refuses to overwrite a file without --force).

  db import <file> [--db <path>] [--env <path>]
      Read an export into the database; importing the same file twice changes nothing.

  eval "<fen>" [--depth 16]
      Ask Stockfish about one position (score is for the side to move).

  models
      Print which model handles which coaching task.
`;

async function evalCmd(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { depth: { type: "string" } },
  });
  const fen = positionals[0];
  if (!fen) throw new Error('usage: eval "<fen>" [--depth 16]');
  const engine = await UciEngine.start();
  try {
    const r = await engine.evaluate(fen, intOption("depth", values.depth, 16, 1, MAX_DEPTH));
    console.log(JSON.stringify({ engine: engine.name, ...r }));
  } finally {
    await engine.quit();
  }
}

async function fetchCmd(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { max: { type: "string" }, since: { type: "string" }, out: { type: "string" } },
  });
  const platform = Platform.parse(positionals[0]);
  const username = positionals[1];
  if (!username) throw new Error("username is required");
  const games = await fetchGames(platform, username, {
    max: intOption("max", values.max, 20, 1),
    since: values.since ? new Date(values.since) : undefined,
  });
  const out = values.out ?? `data/${platform}-${username.toLowerCase()}.json`;
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(games, null, 2));
  const tally = { win: 0, loss: 0, draw: 0 };
  for (const g of games) {
    const p = perspective(g, username);
    if (p) tally[p.outcome]++;
  }
  console.log(`${games.length} games -> ${out}  (W${tally.win} L${tally.loss} D${tally.draw})`);
}

async function analyzeCmd(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      player: { type: "string" },
      index: { type: "string" },
      depth: { type: "string" },
      out: { type: "string" },
    },
  });
  const file = positionals[0];
  if (!file || !values.player) throw new Error("usage: analyze <games.json> --player <username>");
  const games = GameRecord.array().parse(JSON.parse(await readFile(file, "utf8")));
  const game = games[intOption("index", values.index, 0, 0)];
  if (!game) throw new Error(`no game at index ${values.index ?? 0} (file has ${games.length})`);
  const side = perspective(game, values.player);
  if (!side) throw new Error(`${values.player} did not play in ${game.id}`);

  const engine = await UciEngine.start();
  try {
    const started = Date.now();
    // The full game is analysed (the pattern detectors need both sides); only the player's moves are listed.
    const analysis = await analyzeGame(engine, game, { depth: intOption("depth", values.depth, 12, 1, MAX_DEPTH) });
    const own = analysis.moves.filter((m) => m.color === side.color);
    const flagged = own.filter((m) => m.judgment !== "ok");
    console.log(
      `${game.url}\n${values.player} as ${side.color} (${side.outcome}), ${own.length} moves, ` +
        `${analysis.engine.name} depth ${analysis.engine.depth}, ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    for (const m of flagged) {
      const no = `${Math.ceil(m.ply / 2)}${m.color === "white" ? "." : "..."}`;
      console.log(
        `  ${no.padEnd(6)}${m.san.padEnd(8)}${m.judgment.padEnd(11)}` +
          `-${m.winPctLoss.toFixed(1).padStart(4)} win%   best ${m.bestUci ?? "?"}`,
      );
    }
    if (flagged.length === 0) console.log("  no inaccuracies, mistakes or blunders at this depth");
    if (values.out) await writeFile(values.out, JSON.stringify(analysis, null, 2));
  } finally {
    await engine.quit();
  }
}

async function patternsCmd(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      player: { type: "string" },
      max: { type: "string" },
      depth: { type: "string" },
      analyses: { type: "string" },
      examples: { type: "string" },
      all: { type: "boolean" },
      json: { type: "boolean" },
    },
  });
  const file = positionals[0];
  const player = values.player;
  if (!file || !player) throw new Error("usage: patterns <games.json> --player <username>");
  const depth = intOption("depth", values.depth, 12, 1, MAX_DEPTH);
  const examples = intOption("examples", values.examples, 2, 0, 2);
  const log = (msg: string) => process.stderr.write(`${msg}\n`);

  const all = GameRecord.array().parse(JSON.parse(await readFile(file, "utf8")));
  const mine = all.filter((g) => perspective(g, player));
  if (mine.length < all.length) log(`skipped ${all.length - mine.length} games ${player} did not play`);
  const games = values.max ? mine.slice(0, intOption("max", values.max, 0, 1)) : mine;
  if (games.length === 0) throw new Error(`no games for ${player} in ${file}`);

  const cachePath = values.analyses ?? defaultCachePath(file);
  let cache = await loadCache(cachePath);
  const ids = games.map((g) => g.id);
  // Plan without the engine first, so a fully cached run never starts Stockfish.
  let plan = planCache(cache, ids, { depth });
  const engine = needsEngine(plan) ? await UciEngine.start() : undefined;
  const analyses = new Map<string, AnalyzedGame>();
  try {
    if (engine) plan = planCache(cache, ids, { depth, engineName: engine.name });
    log(
      `${games.length} games: ${plan.hits.size} from ${cachePath}, ${plan.missing.length} to analyse` +
        (plan.stale ? ` (${plan.stale} from another analysis version, depth or engine)` : ""),
    );
    for (const [id, a] of plan.hits) analyses.set(id, a);
    const byId = new Map(games.map((g) => [g.id, g]));
    for (const [i, id] of plan.missing.entries()) {
      const started = Date.now();
      const a = await analyzeGame(engine!, byId.get(id)!, { depth });
      analyses.set(id, a);
      // Saved after every game so an interrupted run keeps what it finished.
      cache = mergeCache(cache, [a]);
      await saveCache(cachePath, cache);
      log(`  [${i + 1}/${plan.missing.length}] ${id} ${((Date.now() - started) / 1000).toFixed(1)}s`);
    }
  } finally {
    await engine?.quit();
  }

  const playerGames: PlayerGame[] = [];
  for (const g of games) {
    const pg = toPlayerGame(g, analyses.get(g.id)!, player);
    if (pg) playerGames.push(pg);
  }
  const summary = summarize(player, playerGames);

  if (values.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  const records = new Map(games.map((g) => [g.id, g]));
  console.log(
    formatPatterns(summary, (id) => ({ record: records.get(id), analysis: analyses.get(id) }), {
      examples,
      all: values.all,
    }),
  );
}

const say = (msg: string) => process.stderr.write(`${msg}\n`);

/** One progress line that rewrites itself on a terminal, or plain lines at most every few seconds otherwise. */
class ProgressLine {
  private shown = false;
  private lastPlain = 0;
  constructor(private readonly tty: boolean) {}

  update(text: string, last: boolean): void {
    if (this.tty) {
      process.stderr.write(`\r\x1b[2K${text}`);
      this.shown = true;
    } else if (last || Date.now() - this.lastPlain >= 5000) {
      say(text);
      this.lastPlain = Date.now();
    }
  }

  /** Call before writing anything else, so the line never mixes with other output. */
  clear(): void {
    if (!this.shown) return;
    process.stderr.write("\r\x1b[2K");
    this.shown = false;
  }
}

function minutes(seconds: number): string {
  return `about ${Math.max(1, Math.ceil(seconds / 60))} min`;
}

const day = (iso: string) => iso.slice(0, 10);
const games = (n: number) => `${n} game${n === 1 ? "" : "s"}`;

function buildProvider(flag: ReportArgs["provider"]): { provider?: CoachProvider; noKey: boolean } {
  const r = resolveProvider({ env: process.env, ...(flag ? { flag } : {}) });
  if (r.kind === "none") return { noKey: r.message === NO_KEY_MESSAGE };
  const make = r.kind === "anthropic" ? anthropicProvider : geminiProvider;
  return { provider: make({ apiKey: r.apiKey, choice: r.choice }), noKey: false };
}

async function reportCmd(args: string[]) {
  const a = parseReportArgs(args);
  loadEnv(a.envFile === undefined ? {} : { file: a.envFile });
  const { provider, noKey } = buildProvider(a.provider);
  const store = await openSqliteStore(dbPath(a.db));

  const progress = new ProgressLine(process.stderr.isTTY === true);
  const note = (msg: string) => {
    progress.clear();
    say(msg);
  };
  let shownKey: string | undefined;
  const show = (r: WeeklyReport, heading?: string) => {
    progress.clear();
    shownKey = `${r.periodEnd}#${r.revision}`;
    if (a.json) return;
    if (heading) process.stdout.write(`\n${heading}\n\n`);
    process.stdout.write(`${formatReport(r, { all: a.all })}\n`);
  };
  const shown = (r: WeeklyReport) => shownKey === `${r.periodEnd}#${r.revision}`;

  let warnedNoKey = false;
  let provisionalShown = false;
  let secondsPerGame: number | undefined;

  const controller = new AbortController();
  let engine: UciEngine | undefined;
  let interrupts = 0;
  const onSigint = () => {
    interrupts += 1;
    if (interrupts === 1) {
      controller.abort();
      note("Stopping after the current game (press Ctrl-C again to quit now)...");
      return;
    }
    engine?.kill();
    process.exit(130);
  };
  process.on("SIGINT", onSigint);

  try {
    const outcome = await runReport(
      {
        store,
        fetchGames,
        provider,
        now: () => new Date(),
        signal: controller.signal,
        startEngine: async () => {
          const e = await UciEngine.start();
          engine = e;
          return { evaluator: e, name: e.name, quit: () => e.quit() };
        },
        onProgress: ({ phase, done, total, etaSeconds }) => {
          if (phase === "sample" && total > done && etaSeconds !== null) secondsPerGame = etaSeconds / (total - done);
          const what = phase === "sample" ? "Analysing the sample" : "Analysing the remaining games";
          const eta = etaSeconds !== null && done < total ? `, ${minutes(etaSeconds)} left` : "";
          progress.update(`${what}: ${done} of ${total}${eta}`, done === total);
        },
        onWarning: (message) => note(`Coach wording fell back to templates: ${message}`),
        onReport: (report, { pending }) => {
          if (noKey && !warnedNoKey) {
            note(NO_KEY_MESSAGE);
            warnedNoKey = true;
          }
          if (report.revision === 0) {
            show(report);
            if (pending === 0) return;
            provisionalShown = true;
            if (a.opts.sampleOnly) {
              note(`${games(pending)} not analysed yet (--sample-only); run report again without it to finish.`);
            } else {
              const eta = secondsPerGame === undefined ? "" : ` (${minutes(secondsPerGame * pending)})`;
              note(`Analysing the remaining ${games(pending)}${eta}. Stop any time; run report again to continue.`);
            }
          } else if (provisionalShown) {
            show(report, `Updated report (all ${games(report.coverage.total)} analysed):`);
          } else {
            note(
              `Finished the earlier report for the period ending ${day(report.periodEnd)} first ` +
                `(all ${games(report.coverage.total)} analysed).`,
            );
          }
        },
      },
      a.opts,
    );
    progress.clear();

    const r = outcome.report;
    const n = outcome.newGames;
    const waitingLine = (since: string) =>
      `${n} new game${n === 1 ? "" : "s"} since ${day(since)}; a new report needs ${MIN_REPORT_GAMES} (${outcome.needed} more)`;
    if (outcome.lostRace) {
      note("Another run stored a report for this period first; showing that one.");
    } else if (outcome.status === "unchanged" && r) {
      note(`No new games since ${day(r.periodEnd)}; showing the latest report.`);
    }
    if (r && !shown(r)) show(r);
    if (outcome.status === "waiting" || (outcome.status === "resumed" && outcome.needed > 0 && outcome.newGames > 0)) {
      if (r) {
        note(waitingLine(r.periodEnd));
      } else if (outcome.newGames === 0) {
        note(
          `No rated bullet, blitz, rapid or classical games found for ${a.opts.username} on ${a.opts.platform} ` +
            `in the last ${MAX_LOOKBACK_DAYS} days, so there is nothing to report yet.`,
        );
      } else {
        note(`${games(outcome.newGames)} found; a first report needs ${MIN_REPORT_GAMES} (${outcome.needed} more).`);
      }
    }
    if (outcome.otherTracks && outcome.otherTracks.length > 0 && r) {
      note(
        `Also tracked: ${outcome.otherTracks.map((t) => t.timeClass).join(", ")}. ` +
          `This is ${r.track.timeClass}; choose another with --time-class <class>.`,
      );
    }
    if (a.json) process.stdout.write(`${JSON.stringify(r ?? null, null, 2)}\n`);
  } catch (err) {
    progress.clear();
    if (err instanceof AnalysisAborted) {
      say(`${err.message}; run report again to continue`);
      process.exitCode = 130;
      return;
    }
    throw err;
  } finally {
    process.off("SIGINT", onSigint);
    await store.close();
  }
}

async function dbCmd(args: string[]) {
  const a = parseDbArgs(args);
  loadEnv(a.envFile === undefined ? {} : { file: a.envFile });
  const path = dbPath(a.db);
  if (a.action === "export") await dbExport(path, a.file, a.force);
  else await dbImport(path, a.file);
}

/**
 * Write the database as NDJSON to `<file>.tmp`, then rename it over `file`, so a failure never
 * leaves a partial file or wipes an existing one (even with `--force`).
 */
async function dbExport(path: string, file: string, force: boolean) {
  if (!existsSync(path)) throw new ConfigError(`no database at ${path}`);
  const exists = () => {
    if (!force && existsSync(file)) throw new ConfigError(`${file} already exists; pass --force to overwrite it`);
  };
  exists();
  const store = await openSqliteStore(path, { readOnly: true });
  const tmp = `${file}.tmp`;
  const counts: Record<string, number> = { track: 0, game: 0, analysis: 0, report: 0 };
  let out: WriteStream | undefined;
  let failed: Error | undefined;
  try {
    const stream = createWriteStream(tmp);
    out = stream;
    stream.on("error", (err) => {
      failed ??= err;
    });
    await once(stream, "open");
    await exportStore(store, async (line) => {
      if (failed) throw failed;
      const type = /^\{"type":"(\w+)"/.exec(line)?.[1];
      if (type && type in counts) counts[type]! += 1;
      if (!stream.write(`${line}\n`)) await once(stream, "drain");
    });
    await new Promise<void>((resolve, reject) => stream.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (failed) throw failed;
    exists();
    await rename(tmp, file);
  } catch (err) {
    out?.destroy();
    await unlink(tmp).catch(() => {});
    throw err;
  } finally {
    await store.close();
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(
    `Exported ${total} records (${counts.track} tracks, ${counts.game} games, ${counts.analysis} analyses, ` +
      `${counts.report} reports) from ${path} to ${file}`,
  );
}

async function dbImport(path: string, file: string) {
  if (!existsSync(file)) throw new ConfigError(`no file at ${file}`);
  const store = await openSqliteStore(path);
  try {
    const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
    const { imported } = await importStore(store, lines);
    console.log(`Imported ${imported} lines from ${file} into ${path}`);
  } finally {
    await store.close();
  }
}

/** Errors in what the user passed: exit 2 rather than 1. */
const isUsageError = (err: unknown) =>
  err instanceof ConfigError || err instanceof ReportInputError || err instanceof EnvFileError;

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "fetch") await fetchCmd(rest);
  else if (command === "analyze") await analyzeCmd(rest);
  else if (command === "patterns") await patternsCmd(rest);
  else if (command === "report") await reportCmd(rest);
  else if (command === "db") await dbCmd(rest);
  else if (command === "eval") await evalCmd(rest);
  else if (command === "models") console.table(COACH_ROUTES);
  else {
    console.log(USAGE);
    process.exitCode = command && command !== "--help" && command !== "help" ? 2 : 0;
  }
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = isUsageError(err) ? 2 : 1;
}
