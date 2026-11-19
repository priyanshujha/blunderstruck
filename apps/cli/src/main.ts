#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { COACH_ROUTES } from "@blunderstruck/coach";
import { GameRecord, Platform, perspective } from "@blunderstruck/contracts";
import { UciEngine, analyzeGame } from "@blunderstruck/engine";
import { fetchGames } from "@blunderstruck/ingest";

const USAGE = `blunderstruck <command>

  fetch <lichess|chesscom> <username> [--max 20] [--since 2026-11-01] [--out data/games.json]
      Pull recent finished standard games and write them as normalised JSON.

  analyze <games.json> --player <username> [--index 0] [--depth 12] [--out file.json]
      Run Stockfish over one game and list the player's inaccuracies, mistakes and blunders.

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
    const analysis = await analyzeGame(engine, game, {
      depth: values.depth ? Number(values.depth) : 12,
      only: side.color,
    });
    const flagged = analysis.moves.filter((m) => m.judgment !== "ok");
    console.log(
      `${game.url}\n${values.player} as ${side.color} (${side.outcome}), ${analysis.moves.length} moves, ` +
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

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "fetch") await fetchCmd(rest);
  else if (command === "analyze") await analyzeCmd(rest);
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
