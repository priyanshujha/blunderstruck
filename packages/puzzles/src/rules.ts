import { PUZZLE_MAX_ACCEPTED, type PatternId, type PuzzleKind } from "@blunderstruck/contracts";

/*
 * Every rule that decides which positions become puzzles, in one place. Win% is the solver's
 * win probability, 0-100, from the engine's score for the side to move. Changing any of these
 * changes which puzzles are built: bump `PUZZLE_VERSION` when you do.
 */

/** Engine depth for the accepted set: the same depth as the deeper check of flagged moves. */
export const PUZZLE_DEPTH = 18;

/** Engine lines searched per position (MultiPV). The set is closed only if the last one is out. */
export const PUZZLE_LINES = 5;

/** A move is accepted when it is within this many win% points of the best move. */
export const ACCEPT_MARGIN = 5;

/** A do-over accepts at most this many moves: more and the position has no clear answer. */
export const DO_OVER_MAX_ACCEPTED = PUZZLE_MAX_ACCEPTED;

/** A punish accepts at most this many moves: the mistake must be punished by something specific. */
export const PUNISH_MAX_ACCEPTED = 2;

/** A punish is kept only if its best move gives the solver at least this win%. */
export const PUNISH_MIN_WIN_PCT = 60;

/** A position with fewer legal moves than this is close to forced: no puzzle. */
export const MIN_LEGAL_MOVES = 3;

/** Mistakes before this ply are skipped (opening-trouble excepted): too close to book. */
export const MIN_PLY = 8;

/** At most this many puzzles from one game. */
export const MAX_PER_GAME = 2;

/** At most this many positions are sent to the engine in one run, which bounds engine time. */
export const MAX_PER_RUN = 12;

/** Patterns whose mistakes may be early in the game: `MIN_PLY` does not apply to them. */
export const EARLY_PATTERNS: ReadonlySet<PatternId> = new Set(["opening-trouble"]);

/**
 * Which puzzle each pattern gives, from what the mistake was:
 *
 * - The `missed-*` patterns are a good move the player did not find, so the puzzle is to find
 *   it: a do-over at the position before the move.
 * - `allowed-mate`, `allowed-tactic` and `hung-piece` are a move that gave the opponent a
 *   chance, so the puzzle is to take that chance: a punish at the position after the move.
 * - `thrown-win` and `opening-trouble` are a move that went wrong where a better one existed:
 *   a do-over.
 * - `time-trouble` is about the clock, not a position: no puzzle.
 */
export const PATTERN_PUZZLE_KINDS: Record<PatternId, readonly PuzzleKind[]> = {
  "missed-mate": ["do-over"],
  "missed-capture": ["do-over"],
  "missed-tactic": ["do-over"],
  "allowed-mate": ["punish"],
  "allowed-tactic": ["punish"],
  "hung-piece": ["punish"],
  "thrown-win": ["do-over"],
  "opening-trouble": ["do-over"],
  "time-trouble": [],
};

/** The puzzle kinds a pattern id gives; none for an id this version does not know. */
export function puzzleKindsFor(patternId: string): readonly PuzzleKind[] {
  return Object.hasOwn(PATTERN_PUZZLE_KINDS, patternId) ? PATTERN_PUZZLE_KINDS[patternId as PatternId] : [];
}

/** Whether a mistake at `ply` is late enough for a puzzle. */
export function plyAllowed(patternId: string, ply: number): boolean {
  return ply >= MIN_PLY || EARLY_PATTERNS.has(patternId as PatternId);
}

/** Whether a position has enough legal moves to be a puzzle. */
export function enoughLegalMoves(legalMoves: number): boolean {
  return legalMoves >= MIN_LEGAL_MOVES;
}

/** The first four FEN fields (board, side to move, castling, en passant): the same position however reached. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/**
 * Whether an accepted set makes a good puzzle of this kind. A do-over must not accept the move
 * that was played (that would make the mistake a solution). A punish must leave the solver
 * clearly better.
 */
export function acceptedSetAllowed(
  kind: PuzzleKind,
  accepted: readonly string[],
  playedUci: string,
  bestWinPct: number,
): boolean {
  if (accepted.length === 0) return false;
  if (kind === "do-over") return accepted.length <= DO_OVER_MAX_ACCEPTED && !accepted.includes(playedUci);
  return accepted.length <= PUNISH_MAX_ACCEPTED && bestWinPct >= PUNISH_MIN_WIN_PCT;
}
