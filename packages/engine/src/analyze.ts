import {
  ANALYSIS_VERSION,
  BEST_LINE_MAX_PLIES,
  type AnalyzedGame,
  type AnalyzedMove,
  type Color,
  type GameRecord,
  type Score,
} from "@blunderstruck/contracts";
import { judge, moverWinPct, toWhitePov } from "./judge";
import { pliesFromPgn } from "./positions";
import type { EvalResult } from "./uci";

/** The part of UciEngine that analysis needs; tests pass a stub. */
export interface Evaluator {
  name: string;
  evaluate(fen: string, depth: number): Promise<EvalResult>;
  /** The best `lines` moves, best first; engines that cannot search several lines leave it out. */
  evaluateMulti?(fen: string, depth: number, lines: number): Promise<EvalResult[]>;
  /** Forget earlier searches, so a game's analysis does not depend on what ran before it. */
  newGame?(): Promise<void>;
}

export interface AnalyzeOptions {
  /** Search depth per position. Default 12. */
  depth?: number;
  /** Only judge this side's moves (every position is still evaluated once). */
  only?: Color;
}

const other = (c: Color): Color => (c === "white" ? "black" : "white");

/** The engine's main line, kept only when it starts with the move the engine chose. */
function bestLineOf(r: EvalResult): string[] | undefined {
  if (!r.bestMove || !r.pv || r.pv[0] !== r.bestMove) return undefined;
  return r.pv.slice(0, BEST_LINE_MAX_PLIES);
}

/** Evaluates every position of a game once and scores each move by the win probability it gave away. */
export async function analyzeGame(
  engine: Evaluator,
  game: Pick<GameRecord, "id" | "pgn">,
  opts: AnalyzeOptions = {},
): Promise<AnalyzedGame> {
  const depth = opts.depth ?? 12;
  const plies = pliesFromPgn(game.pgn);
  const moves: AnalyzedMove[] = [];
  await engine.newGame?.();

  let before: { score: Score; best?: string; line?: string[] } | undefined;
  for (const p of plies) {
    if (!before) {
      const r = await engine.evaluate(p.fenBefore, depth);
      before = { score: toWhitePov(r.score, p.color), best: r.bestMove, line: bestLineOf(r) };
    }
    let after: { score: Score; best?: string; line?: string[] };
    if (p.terminal === "checkmate") {
      after = { score: { mate: p.color === "white" ? 1 : -1 } };
    } else if (p.terminal === "draw") {
      after = { score: { cp: 0 } };
    } else {
      const r = await engine.evaluate(p.fenAfter, depth);
      after = { score: toWhitePov(r.score, other(p.color)), best: r.bestMove, line: bestLineOf(r) };
    }

    if (!opts.only || opts.only === p.color) {
      const winPctBefore = moverWinPct(before.score, p.color);
      const winPctAfter = moverWinPct(after.score, p.color);
      // Playing the engine's own first choice is never a mistake, whatever depth noise says.
      const winPctLoss = before.best === p.uci ? 0 : Math.max(0, winPctBefore - winPctAfter);
      moves.push({
        ply: p.ply,
        color: p.color,
        san: p.san,
        uci: p.uci,
        fenBefore: p.fenBefore,
        fenAfter: p.fenAfter,
        bestUci: before.best,
        ...(before.line ? { bestLine: before.line } : {}),
        scoreBefore: before.score,
        scoreAfter: after.score,
        winPctBefore,
        winPctAfter,
        winPctLoss,
        judgment: judge(winPctLoss),
        clockSeconds: p.clockSeconds,
      });
    }
    before = after;
  }

  // After the loop `before` holds the position after the last move; it has no line when the
  // game ended on the board, since that position is never evaluated.
  return {
    gameId: game.id,
    analysisVersion: ANALYSIS_VERSION,
    engine: { name: engine.name, depth },
    moves,
    ...(before?.line ? { finalLine: before.line } : {}),
  };
}
