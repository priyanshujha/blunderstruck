#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { COACH_ROUTES } from "@blunderstruck/coach";
import { type AnalyzedGame, GameRecord, Platform, perspective } from "@blunderstruck/contracts";
import { UciEngine, analyzeGame } from "@blunderstruck/engine";
import { fetchGames } from "@blunderstruck/ingest";
import { summarize, toPlayerGame, type PlayerGame } from "@blunderstruck/patterns";
import { defaultCachePath, loadCache, mergeCache, needsEngine, planCache, saveCache } from "./analysis-cache";
import { formatPatterns } from "./patterns-format";

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
    const r = await engine.evaluate(fen, values.depth ? Number(values.depth) : 16);
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
    max: values.max ? Number(values.max) : 20,
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
  const game = games[Number(values.index ?? 0)];
  if (!game) throw new Error(`no game at index ${values.index ?? 0} (file has ${games.length})`);
  const side = perspective(game, values.player);
  if (!side) throw new Error(`${values.player} did not play in ${game.id}`);

  const engine = await UciEngine.start();
  try {
    const started = Date.now();
    // The full game is analysed (the pattern detectors need both sides); only the player's moves are listed.
    const analysis = await analyzeGame(engine, game, { depth: values.depth ? Number(values.depth) : 12 });
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

function intOption(name: string, value: string | undefined, fallback: number, min: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new Error(`--${name} must be an integer of at least ${min}`);
  return n;
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
  const depth = intOption("depth", values.depth, 12, 1);
  const examples = intOption("examples", values.examples, 2, 0);
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

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "fetch") await fetchCmd(rest);
  else if (command === "analyze") await analyzeCmd(rest);
  else if (command === "patterns") await patternsCmd(rest);
  else if (command === "eval") await evalCmd(rest);
  else if (command === "models") console.table(COACH_ROUTES);
  else {
    console.log(USAGE);
    process.exitCode = command ? 2 : 0;
  }
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
