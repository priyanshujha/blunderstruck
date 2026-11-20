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
 * The game as its checked values describe it. For each checked move: its scores, `bestUci` and
 * `bestLine` come from the check; the next ply's `bestLine` (and `bestUci`, its first move)
 * becomes `check.answerLine`, or the game's `finalLine` does when it is the last move. Scores
 * shared with neighbouring moves are updated so that one move's `scoreAfter` always equals the
 * next move's `scoreBefore`; where two adjacent moves were both checked, the shared position takes
 * the later move's own evaluation of it. Every affected move's win%, loss and judgment are then
 * recomputed with the usual rules. Moves next to no checked move are left untouched.
 *
 * Returns a new game and keeps every `check` field, so applying it twice gives the same result.
 * When the check found no line from a position, the first-look line there is kept.
 */
export function resolveChecked(analysis: AnalyzedGame): AnalyzedGame {
  const out = structuredClone(analysis);
  const moves = out.moves;
  const touched = new Set<AnalyzedMove>();
  const at = (i: number, ply: number): AnalyzedMove | undefined => (moves[i]?.ply === ply ? moves[i] : undefined);

  moves.forEach((m, i) => {
    const c = m.check;
    if (!c) return;
    touched.add(m);
    m.scoreBefore = c.scoreBefore;
    if (c.bestUci) m.bestUci = c.bestUci;
    else delete m.bestUci;
    if (c.bestLine) m.bestLine = c.bestLine;
    else delete m.bestLine;
    m.scoreAfter = c.scoreAfter;

    const next = at(i + 1, m.ply + 1);
    if (next?.check) {
      m.scoreAfter = next.check.scoreBefore;
    } else if (next) {
      next.scoreBefore = c.scoreAfter;
      if (c.answerLine) {
        next.bestLine = c.answerLine;
        next.bestUci = c.answerLine[0];
      }
      touched.add(next);
    } else if (i === moves.length - 1 && c.answerLine) {
      out.finalLine = c.answerLine;
    }

    const prev = at(i - 1, m.ply - 1);
    if (prev && !prev.check) {
      prev.scoreAfter = c.scoreBefore;
      touched.add(prev);
    }
  });

  for (const m of touched) {
    m.winPctBefore = moverWinPct(m.scoreBefore, m.color);
    m.winPctAfter = moverWinPct(m.scoreAfter, m.color);
    m.winPctLoss = m.bestUci === m.uci ? 0 : Math.max(0, m.winPctBefore - m.winPctAfter);
    m.judgment = judge(m.winPctLoss);
  }
  return out;
}
