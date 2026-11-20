import { type AnalyzedMove, JUDGMENT_THRESHOLDS } from "@blunderstruck/contracts";

/*
 * Every threshold the detectors use, in one place. Win% is the mover's win probability, 0-100,
 * as stored on `AnalyzedMove`. Material is in pawns (see `PIECE_VALUES` in board.ts).
 * Changing any of these changes what is counted: bump `PATTERNS_VERSION` when you do.
 */

/** A move that leaves the mover at or above this win% (about +3.8) is "still winning": not counted. */
export const STILL_WINNING = 80;

/** A move made at or below this win% is from an already lost position: not counted. */
export const ALREADY_LOST = 20;

/** `hung-piece`: the smallest net loss (exchange value minus what the move won) that counts. */
export const HUNG_MIN_NET = 2;

/** `missed-mate` and `allowed-mate`: mates in this many moves or fewer. */
export const MATE_HORIZON = 2;

/** `thrown-win`: the player reached at least this win% (about +4.7)... */
export const THROWN_WIN_PEAK = 85;

/** ...and a later move of theirs left them below this win%, and they did not win. */
export const THROWN_WIN_FLOOR = 70;

/** Tactic patterns: the smallest material swing, in pawns, between the best and the played line. */
export const TACTIC_MIN_GAIN = 2;

/**
 * Tactic lines: material is read at the first quiet point at or after this many plies (side to
 * move not in check, next move of the line not a capture).
 */
export const TACTIC_SETTLE_MIN_PLIES = 4;

/** `opening-trouble`: only mistakes at or before this ply (move 12 for both sides). */
export const OPENING_MAX_PLY = 24;

/** `opening-trouble`: the position must be a countable mistake in at least this many games. */
export const OPENING_MIN_GAMES = 2;

/** Top habits: a pattern needs at least this many unexplained findings... */
export const TOP_MIN_OCCURRENCES = 2;

/** ...spread over at least this many games. */
export const TOP_MIN_GAMES = 2;

/** At most this many top habits. */
export const TOP_MAX = 3;

/** `time-trouble`: the threshold is this share of the expected game time (base + 40 increments)... */
export const TIME_TROUBLE_SHARE = 0.1;
/** ...counting this many moves of increment... */
export const TIME_TROUBLE_MOVES = 40;
/** ...but never below this many seconds... */
export const TIME_TROUBLE_MIN_SECONDS = 10;
/** ...or above this many. */
export const TIME_TROUBLE_MAX_SECONDS = 30;

/** Seconds on the clock below which a mistake counts as `time-trouble` (180+0 gives 18, 180+2 gives 26). */
export function timeTroubleThreshold(clock: { baseSeconds: number; incrementSeconds: number }): number {
  const raw = TIME_TROUBLE_SHARE * (clock.baseSeconds + TIME_TROUBLE_MOVES * clock.incrementSeconds);
  return Math.min(TIME_TROUBLE_MAX_SECONDS, Math.max(TIME_TROUBLE_MIN_SECONDS, raw));
}

/**
 * The winning-anyway rule alone: the move left the mover below `STILL_WINNING` and was made
 * from above `ALREADY_LOST`. Moves near either end of the win% curve are not counted.
 */
export function passesWinningAnyway(move: AnalyzedMove): boolean {
  return move.winPctAfter < STILL_WINNING && move.winPctBefore > ALREADY_LOST;
}

/**
 * A move the patterns may count: it lost at least `JUDGMENT_THRESHOLDS.mistake` win% and
 * passes the winning-anyway rule. `missed-mate` is the one detector that does not use this.
 */
export function isCountable(move: AnalyzedMove): boolean {
  return move.winPctLoss >= JUDGMENT_THRESHOLDS.mistake && passesWinningAnyway(move);
}
