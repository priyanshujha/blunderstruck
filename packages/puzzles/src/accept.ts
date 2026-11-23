import type { EvalResult } from "@blunderstruck/engine";
import { winPct } from "@blunderstruck/engine";
import { ACCEPT_MARGIN, PUZZLE_LINES } from "./rules";

/** The moves that count as solving a position, and whether that list is complete. */
export interface AcceptedSet {
  /** Accepted moves (UCI), best first. */
  accepted: string[];
  /**
   * True when no move outside the searched lines could also be accepted: the last line falls
   * outside the rule, or the position has fewer legal moves than lines searched.
   */
  closed: boolean;
  /** Solver's win% after the best move. */
  bestWinPct: number;
  /** Set when the best line is a forced mate for the solver: mate in this many moves. */
  mateIn?: number;
  /** The engine's main line from the position (UCI), starting with the best move. */
  line: string[];
}

const moveOf = (r: EvalResult): string | undefined => r.bestMove ?? r.pv?.[0];

/** A mate for the side to move, in this many moves; undefined for anything else. */
function mateFor(r: EvalResult): number | undefined {
  return "mate" in r.score && r.score.mate > 0 ? r.score.mate : undefined;
}

/**
 * Which moves solve a position, from the engine's best `lines` lines (best first, scores from
 * the side to move, who is the solver).
 *
 * A move is accepted when its win% is within `ACCEPT_MARGIN` of the best. When the best line
 * is a forced mate in N, win% cannot tell a mate from a merely winning move, so only moves that
 * also mate in N or fewer are accepted. The set is closed when the last line is not accepted,
 * or when there are fewer legal moves than lines: then no unsearched move could be accepted.
 * Undefined when the engine gave no line with a move.
 */
export function acceptedSet(
  results: readonly EvalResult[],
  legalMoves: number,
  lines: number = PUZZLE_LINES,
): AcceptedSet | undefined {
  const best = results[0];
  const bestMove = best && moveOf(best);
  if (!best || !bestMove) return undefined;
  const bestWinPct = winPct(best.score);
  const mateIn = mateFor(best);
  const ok = (r: EvalResult): boolean => {
    if (mateIn !== undefined) {
      const m = mateFor(r);
      return m !== undefined && m <= mateIn;
    }
    return bestWinPct - winPct(r.score) <= ACCEPT_MARGIN;
  };
  const accepted: string[] = [];
  for (const r of results.slice(0, lines)) {
    const move = moveOf(r);
    if (move && ok(r) && !accepted.includes(move)) accepted.push(move);
  }
  const last = results[lines - 1];
  const closed = legalMoves < lines || (last !== undefined && !ok(last));
  const line = best.pv && best.pv[0] === bestMove ? [...best.pv] : [bestMove];
  return { accepted, closed, bestWinPct, ...(mateIn !== undefined ? { mateIn } : {}), line };
}
