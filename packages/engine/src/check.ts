import {
  BEST_LINE_MAX_PLIES,
  type AnalyzedGame,
  type AnalyzedMove,
  type Color,
  type MoveCheck,
  type Score,
} from "@blunderstruck/contracts";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import type { Evaluator } from "./analyze";
import { judge, moverWinPct, toWhitePov } from "./judge";
import type { EvalResult } from "./uci";

/** A first look that lost at least this much win% is checked again. */
export const CHECK_MIN_LOSS = 5;
/** A mate in at most this many moves that the move gave up is checked again, whatever it lost. */
export const CHECK_MATE_WITHIN = 2;

export interface CheckOptions {
  /** Search depth of the check. A positive integer. */
  depth: number;
  /** The side whose moves are checked. */
  color: Color;
}

const other = (c: Color): Color => (c === "white" ? "black" : "white");
const COLOR_ORDER: readonly Color[] = ["white", "black"];

/** Moves to mate for `mover` (positive), or undefined when the score is not a mate for them. */
function mateFor(score: Score, mover: Color): number | undefined {
  if (!("mate" in score)) return undefined;
  const n = mover === "white" ? score.mate : -score.mate;
  return n > 0 ? n : undefined;
}

/** The engine's main line, kept only when it starts with the move the engine chose. */
function bestLineOf(r: EvalResult): string[] | undefined {
  if (!r.bestMove || !r.pv || r.pv[0] !== r.bestMove) return undefined;
  return r.pv.slice(0, BEST_LINE_MAX_PLIES);
}

/** The stored score of a position that ended the game on the board, or undefined if play goes on. */
function terminalScore(fenAfter: string, mover: Color): Score | undefined {
  const setup = parseFen(fenAfter);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return undefined;
  if (pos.value.isCheckmate()) return { mate: mover === "white" ? 1 : -1 };
  if (pos.value.isEnd()) return { cp: 0 };
  return undefined;
}

/**
 * The plies of `color`'s moves to check at `depth`, in ascending order: every move whose first
 * look lost at least `CHECK_MIN_LOSS` win%, and every move that had a mate within
 * `CHECK_MATE_WITHIN` and left the mover without one. Moves already checked at `depth` are left
 * out. Reads the first-look fields, so pass the stored analysis, not a `resolveChecked` one.
 */
export function checkMoves(analysis: AnalyzedGame, color: Color, depth: number): number[] {
  if (!Number.isInteger(depth) || depth <= 0) return [];
  const plies: number[] = [];
  for (const m of analysis.moves) {
    if (m.color !== color || m.check?.depth === depth) continue;
    const lost = m.winPctLoss >= CHECK_MIN_LOSS;
    const mateBefore = mateFor(m.scoreBefore, m.color);
    const gaveUpMate =
      mateBefore !== undefined && mateBefore <= CHECK_MATE_WITHIN && mateFor(m.scoreAfter, m.color) === undefined;
    if (lost || gaveUpMate) plies.push(m.ply);
  }
  return plies.sort((a, b) => a - b);
}

/**
 * Evaluates `color`'s chosen moves again at `opts.depth` and records each result as
 * `AnalyzedMove.check`; the first-look fields are kept as they were. Calls `newGame` first, then
 * evaluates each chosen move's `fenBefore` and then its `fenAfter` (skipped when the move ended
 * the game), in ply order, so the result never depends on what the engine searched before.
 *
 * Reads the first-look fields, so pass the stored analysis, not a `resolveChecked` one.
 * Returns a new game; the input is not changed. A game already checked at this depth for this
 * colour is returned as a copy without calling the engine. Checking the other colour at the same
 * depth adds it to `check.colors`; a check at another depth replaces every earlier check.
 */
export async function checkGame(
  engine: Evaluator,
  analysis: AnalyzedGame,
  opts: CheckOptions,
): Promise<AnalyzedGame> {
  const { depth, color } = opts;
  if (!Number.isInteger(depth) || depth <= 0) {
    throw new RangeError(`check depth must be a positive integer, got ${depth}`);
  }
  const out = structuredClone(analysis);
  const prior = analysis.check?.depth === depth ? analysis.check.colors : [];
  if (prior.includes(color)) return out;
  if (analysis.check && analysis.check.depth !== depth) {
    for (const m of out.moves) delete m.check;
  }

  const chosen = new Set(checkMoves(out, color, depth));
  await engine.newGame?.();
  for (const m of out.moves) {
    if (!chosen.has(m.ply)) continue;
    m.check = await checkMove(engine, m, depth);
  }

  const colors = COLOR_ORDER.filter((c) => c === color || prior.includes(c));
  out.check = { depth, colors };
  return out;
}

async function checkMove(engine: Evaluator, m: AnalyzedMove, depth: number): Promise<MoveCheck> {
  const b = await engine.evaluate(m.fenBefore, depth);
  const scoreBefore = toWhitePov(b.score, m.color);
  const bestLine = bestLineOf(b);

  let scoreAfter = terminalScore(m.fenAfter, m.color);
  let answerLine: string[] | undefined;
  if (!scoreAfter) {
    const a = await engine.evaluate(m.fenAfter, depth);
    scoreAfter = toWhitePov(a.score, other(m.color));
    answerLine = bestLineOf(a);
  }

  const winPctBefore = moverWinPct(scoreBefore, m.color);
  const winPctAfter = moverWinPct(scoreAfter, m.color);
  // Playing the engine's own first choice is never a mistake, at this depth too.
  const winPctLoss = b.bestMove === m.uci ? 0 : Math.max(0, winPctBefore - winPctAfter);
  return {
    depth,
    scoreBefore,
    scoreAfter,
    ...(b.bestMove ? { bestUci: b.bestMove } : {}),
    ...(bestLine ? { bestLine } : {}),
    ...(answerLine ? { answerLine } : {}),
    winPctBefore,
    winPctAfter,
    winPctLoss,
    judgment: judge(winPctLoss),
  };
}

/**
 * The game as its checked values describe it. A checked move takes every checked value: both
 * scores, both win%, the loss, the judgment, and `bestUci` and `bestLine` (dropped when the check
 * has none). A move without its own `check` keeps every first-look number exactly as stored; the
 * only thing a check may change on it is its `bestUci` and `bestLine`, which take the checked
 * `answerLine` of the move just before it (the same position, searched deeper) when that line
 * exists. The game's `finalLine` takes the `answerLine` of a checked last move, but only when the
 * analysis holds both colours' moves, so that its last stored move is known to be the game's last.
 *
 * Returns a new game and keeps every `check` field, so applying it twice gives the same result.
 */
export function resolveChecked(analysis: AnalyzedGame): AnalyzedGame {
  const out = structuredClone(analysis);
  const moves = out.moves;
  const bothColors = moves.some((m) => m.color === "white") && moves.some((m) => m.color === "black");

  moves.forEach((m, i) => {
    const c = m.check;
    if (!c) return;
    m.scoreBefore = c.scoreBefore;
    m.scoreAfter = c.scoreAfter;
    m.winPctBefore = c.winPctBefore;
    m.winPctAfter = c.winPctAfter;
    m.winPctLoss = c.winPctLoss;
    m.judgment = c.judgment;
    if (c.bestUci) m.bestUci = c.bestUci;
    else delete m.bestUci;
    if (c.bestLine) m.bestLine = c.bestLine;
    else delete m.bestLine;

    if (!c.answerLine) return;
    const next = moves[i + 1];
    if (next?.ply === m.ply + 1) {
      if (!next.check) {
        next.bestLine = c.answerLine;
        next.bestUci = c.answerLine[0];
      }
    } else if (i === moves.length - 1 && bothColors) {
      out.finalLine = c.answerLine;
    }
  });
  return out;
}
