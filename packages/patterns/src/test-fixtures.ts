/**
 * Test helpers: turn a short invented PGN plus a few scripted engine answers into the
 * `AnalyzedGame` / `PlayerGame` the detectors read, through the real `analyzeGame` with a stub
 * `Evaluator`. No Stockfish, no network. Test-only: not exported from the package index.
 *
 * Example (Four Knights, 4.Ba6?? bxa6, from White's side):
 *
 *   const g = await fixtureGame({
 *     pgn: "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Ba6 bxa6",
 *     as: "white",
 *     result: "black",
 *     evals: {
 *       // Keys: a ply number = the position before that ply (here, before 4.Ba6) ...
 *       7: { cp: 20, pv: ["Bb5", "Nd4"] },
 *       // ... or a FEN (matched on its first four fields). Scores are from White's side.
 *       "r1bqkb1r/pppp1ppp/B1n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 5 4": { cp: -618, pv: ["bxa6"] },
 *     },
 *   });
 *   expect(hungPiece.detect(g)).toMatchObject([{ ply: 7 }]);
 *
 * Unscripted positions get `default` (0 cp, no best move unless given). `pv` entries may be
 * UCI or SAN; they are converted to UCI from the scripted position, and `bestMove` defaults to
 * the first of them. The player is "fixture-white" or "fixture-black".
 */
import type { AnalyzedGame, Color, GameRecord, Score } from "@blunderstruck/contracts";
import { analyzeGame, type Evaluator, pliesFromPgn } from "@blunderstruck/engine";
import { parseSan } from "chessops/san";
import type { Move } from "chessops/types";
import { makeUci } from "chessops/util";
import { legalMove, positionFromFen, positionKey, type Position } from "./board";
import { toPlayerGame } from "./game";
import type { PlayerGame } from "./types";

/** A scripted engine answer. Score from White's side: give `cp` or `mate` (White mates in n > 0). */
export interface ScriptedEval {
  cp?: number;
  mate?: number;
  /** Engine's best move, UCI or SAN. Defaults to `pv[0]`. */
  bestMove?: string;
  /** Engine's main line, UCI or SAN. Defaults to `[bestMove]` when only `bestMove` is given. */
  pv?: string[];
}

export interface FixtureOptions {
  /** Movetext ("1. e4 e5 ...") or a full PGN; `%clk` comments are read. Add a FEN header to start elsewhere. */
  pgn: string;
  /** Position -> engine answer. Key: a ply number (the position before that ply) or a FEN. */
  evals?: Record<string | number, ScriptedEval>;
  /** Answer for positions not in `evals`. Default `{ cp: 0 }`. */
  default?: ScriptedEval;
  id?: string;
  depth?: number;
  result?: GameRecord["result"];
  timeControl?: string;
  timeClass?: GameRecord["timeClass"];
  termination?: string;
  opening?: GameRecord["opening"];
}

export const FIXTURE_PLAYERS: Readonly<Record<Color, string>> = {
  white: "fixture-white",
  black: "fixture-black",
};

let counter = 0;

/** Standard UCI (castling as the king's two-square move), as the engine package writes it. */
function standardUci(pos: Position, move: Move): string {
  if ("from" in move) {
    const piece = pos.board.get(move.from);
    const target = pos.board.get(move.to);
    if (piece?.role === "king" && target?.role === "rook" && target.color === piece.color) {
      return makeUci({ from: move.from, to: (move.from >> 3) * 8 + (move.to > move.from ? 6 : 2) });
    }
  }
  return makeUci(move);
}

/** Converts a line of UCI or SAN moves from `fen` to UCI. Throws on a move that is neither. */
export function toUciLine(fen: string, line: readonly string[]): string[] {
  const pos = positionFromFen(fen);
  return line.map((token) => {
    const m = legalMove(pos, token) ?? parseSan(pos, token);
    if (!m) throw new Error(`fixture: "${token}" is not a legal move in ${fen}`);
    const uci = standardUci(pos, m);
    pos.play(m);
    return uci;
  });
}

function toPgn(pgn: string): string {
  return pgn.trimStart().startsWith("[") ? pgn : `[Event "fixture"]\n\n${pgn} *`;
}

/** A stub `Evaluator` answering from a script keyed by position key (first four FEN fields). */
export function scriptedEvaluator(script: ReadonlyMap<string, ScriptedEval>, fallback: ScriptedEval = { cp: 0 }): Evaluator {
  return {
    name: "stub",
    async evaluate(fen) {
      const e = script.get(positionKey(fen)) ?? fallback;
      const turn = fen.split(" ")[1] === "b" ? "black" : "white";
      const white: Score = e.mate !== undefined ? { mate: e.mate } : { cp: e.cp ?? 0 };
      // UCI scores are from the side to move.
      const score: Score =
        turn === "white" ? white : "mate" in white ? { mate: -white.mate } : { cp: -white.cp };
      const pv = e.pv ? toUciLine(fen, e.pv) : e.bestMove ? toUciLine(fen, [e.bestMove]) : undefined;
      const bestMove = e.bestMove ? toUciLine(fen, [e.bestMove])[0] : pv?.[0];
      return { score, depth: 1, ...(bestMove ? { bestMove } : {}), ...(pv ? { pv } : {}) };
    },
  };
}

/** The game record a fixture stands for, with the invented players of `FIXTURE_PLAYERS`. */
export function fixtureRecord(o: FixtureOptions): GameRecord {
  const id = o.id ?? `fixture:${++counter}`;
  return {
    id,
    platform: "lichess",
    url: `https://example.org/${encodeURIComponent(id)}`,
    playedAt: "2026-01-01T00:00:00.000Z",
    rated: true,
    timeClass: o.timeClass ?? "rapid",
    timeControl: o.timeControl ?? "600+0",
    white: { name: FIXTURE_PLAYERS.white },
    black: { name: FIXTURE_PLAYERS.black },
    result: o.result ?? "draw",
    ...(o.termination ? { termination: o.termination } : {}),
    ...(o.opening ? { opening: o.opening } : {}),
    pgn: toPgn(o.pgn),
  };
}

/** Runs `analyzeGame` (full game, both sides) over the fixture with the scripted evaluator. */
export async function fixtureAnalysis(o: FixtureOptions, record: GameRecord = fixtureRecord(o)): Promise<AnalyzedGame> {
  const plies = pliesFromPgn(record.pgn);
  const script = new Map<string, ScriptedEval>();
  for (const [key, e] of Object.entries(o.evals ?? {})) {
    let fen = key;
    if (/^\d+$/.test(key)) {
      const ply = Number(key);
      const p = plies.find((x) => x.ply === ply);
      const last = plies[plies.length - 1];
      if (p) fen = p.fenBefore;
      else if (last && ply === last.ply + 1) fen = last.fenAfter;
      else throw new Error(`fixture: no position before ply ${ply}`);
    }
    script.set(positionKey(fen), e);
  }
  return analyzeGame(scriptedEvaluator(script, o.default), record, { depth: o.depth ?? 1 });
}

/** The fixture as a `PlayerGame` from one side, ready for a detector. */
export async function fixtureGame(o: FixtureOptions & { as: Color }): Promise<PlayerGame> {
  const record = fixtureRecord(o);
  const analysis = await fixtureAnalysis(o, record);
  return toPlayerGame(record, analysis, FIXTURE_PLAYERS[o.as])!;
}
