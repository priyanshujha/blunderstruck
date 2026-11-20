import {
  ANALYSIS_VERSION,
  type AnalyzedGame,
  type AnalyzedMove,
  type Color,
  type GameRecord,
  type Score,
  perspective,
} from "@blunderstruck/contracts";
import type { PlayerGame } from "./types";

/**
 * Base and increment in seconds from a platform time control ("600+5", "180"). Undefined for
 * daily or correspondence games ("1/86400", "3d", "-") and anything unreadable.
 */
export function parseClock(
  timeControl: string,
  timeClass?: GameRecord["timeClass"],
): PlayerGame["clock"] {
  if (timeClass === "daily") return undefined;
  const m = /^(\d+)(?:\+(\d+))?$/.exec(timeControl.trim());
  if (!m) return undefined;
  const baseSeconds = Number(m[1]);
  if (baseSeconds <= 0) return undefined;
  return { baseSeconds, incrementSeconds: Number(m[2] ?? 0) };
}

/**
 * Joins a game record to its analysis from one player's side. Returns null when `username`
 * played neither colour. Throws when the analysis belongs to another game, comes from another
 * `ANALYSIS_VERSION`, or covers only one side's moves (detectors need the opponent's replies:
 * analyse without `only`).
 */
export function toPlayerGame(record: GameRecord, analysis: AnalyzedGame, username: string): PlayerGame | null {
  if (analysis.gameId !== record.id) {
    throw new Error(`analysis is for ${analysis.gameId}, not ${record.id}`);
  }
  if (analysis.analysisVersion !== ANALYSIS_VERSION) {
    throw new Error(
      `${record.id}: analysis version ${analysis.analysisVersion}, expected ${ANALYSIS_VERSION}; analyse the game again`,
    );
  }
  const moves = analysis.moves;
  const gap = moves.findIndex((m, i) => i > 0 && m.ply !== moves[i - 1]!.ply + 1);
  if (gap !== -1) {
    throw new Error(`${record.id}: analysis skips plies (one side only?); analyse the full game`);
  }
  const side = perspective(record, username);
  if (!side) return null;
  const clock = parseClock(record.timeControl, record.timeClass);
  return {
    analysis,
    color: side.color,
    outcome: side.outcome,
    ...(clock ? { clock } : {}),
    ...(record.termination ? { termination: record.termination } : {}),
    ...(record.opening ? { opening: record.opening } : {}),
  };
}

/** The player's own moves, in game order. */
export function playerMoves(g: PlayerGame): AnalyzedMove[] {
  return g.analysis.moves.filter((m) => m.color === g.color);
}

/** The analysed move at `ply`, either colour. */
export function moveAt(g: PlayerGame, ply: number): AnalyzedMove | undefined {
  const moves = g.analysis.moves;
  const first = moves[0];
  if (!first) return undefined;
  const m = moves[ply - first.ply];
  return m?.ply === ply ? m : undefined;
}

/**
 * The opponent's reply: the next ply's entry. Its `uci` is what was played, its `bestUci` and
 * `bestLine` are the engine's answer to `move`. Undefined when `move` ended the game.
 */
export function replyTo(g: PlayerGame, move: AnalyzedMove): AnalyzedMove | undefined {
  return moveAt(g, move.ply + 1);
}

/**
 * The engine's line in answer to `move` (UCI from `move.fenAfter`): the next ply's `bestLine`,
 * or the game's `finalLine` when `move` was the last move. Undefined when the engine gave none.
 */
export function answerTo(g: PlayerGame, move: AnalyzedMove): string[] | undefined {
  const reply = replyTo(g, move);
  if (reply) return reply.bestLine;
  const moves = g.analysis.moves;
  return moves[moves.length - 1]?.ply === move.ply ? g.analysis.finalLine : undefined;
}

/** The same side's previous move (two plies back). */
export function previousOwnMove(g: PlayerGame, move: AnalyzedMove): AnalyzedMove | undefined {
  return moveAt(g, move.ply - 2);
}

/**
 * Seconds on the mover's clock when they started thinking about `move`: their clock after
 * their previous move, or the base time for their first move. Undefined when the game has no
 * clock or the previous move carries no `%clk`.
 */
export function clockBefore(g: PlayerGame, move: AnalyzedMove): number | undefined {
  if (!g.clock) return undefined;
  const prev = previousOwnMove(g, move);
  if (!prev) return g.clock.baseSeconds;
  return prev.clockSeconds;
}

/** Terminations that mean the loser ran out of time (Lichess "outoftime", Chess.com "timeout"). */
const TIME_LOSSES: ReadonlySet<string> = new Set(["outoftime", "timeout"]);

/** The player lost on time. */
export function lostOnTime(g: PlayerGame): boolean {
  return g.outcome === "loss" && !!g.termination && TIME_LOSSES.has(g.termination);
}

/**
 * Mate distance from `color`'s side: positive = `color` mates in n, negative = `color` is
 * mated in n. Undefined for a centipawn score.
 */
export function mateFor(score: Score, color: Color): number | undefined {
  if (!("mate" in score)) return undefined;
  return color === "white" ? score.mate : -score.mate;
}
