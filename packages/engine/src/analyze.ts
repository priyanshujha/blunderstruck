import {
  ANALYSIS_VERSION,
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

  let before: { score: Score; best?: string } | undefined;
  for (const p of plies) {
    if (!before) {
      const r = await engine.evaluate(p.fenBefore, depth);
      before = { score: toWhitePov(r.score, p.color), best: r.bestMove };
    }
    let after: { score: Score; best?: string };
    if (p.terminal === "checkmate") {
      after = { score: { mate: p.color === "white" ? 1 : -1 } };
    } else if (p.terminal === "draw") {
      after = { score: { cp: 0 } };
    } else {
      const r = await engine.evaluate(p.fenAfter, depth);
      after = { score: toWhitePov(r.score, other(p.color)), best: r.bestMove };
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

  return {
    gameId: game.id,
    analysisVersion: ANALYSIS_VERSION,
    engine: { name: engine.name, depth },
    moves,
  };
}
