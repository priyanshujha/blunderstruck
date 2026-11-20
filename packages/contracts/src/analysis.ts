import { z } from "zod";
import { Color } from "./game";

/**
 * Engine score from White's point of view. `mate: 3` = White mates in 3, `mate: -2` = Black
 * mates in 2. A position that is already checkmate is stored as `mate: 1` (Black is mated) or
 * `mate: -1` (White is mated); stored scores never use `mate: 0`.
 */
export const Score = z.union([
  z.object({ cp: z.number().int() }),
  z.object({ mate: z.number().int() }),
]);
export type Score = z.infer<typeof Score>;

export const Judgment = z.enum(["ok", "inaccuracy", "mistake", "blunder"]);
export type Judgment = z.infer<typeof Judgment>;

/**
 * Win-probability points (0-100) the mover gave away, per judgment. These follow
 * Lichess's published thresholds (0.1 / 0.2 / 0.3 on its -1..1 winning-chances scale).
 * Changing them re-labels every stored game: bump ANALYSIS_VERSION when you do.
 */
export const JUDGMENT_THRESHOLDS = { inaccuracy: 5, mistake: 10, blunder: 15 } as const;

/** Bump when engine settings or judgment rules change in a way that makes old analyses incomparable. */
export const ANALYSIS_VERSION = 3;

/** Longest engine main line stored on a move (`AnalyzedMove.bestLine`), in plies. */
export const BEST_LINE_MAX_PLIES = 10;

/**
 * A flagged move evaluated again at a greater depth: both positions, from White's point of view
 * for the scores and from the mover's for win%. Added in analysis version 3.
 */
export const MoveCheck = z.object({
  depth: z.number().int().positive(),
  scoreBefore: Score,
  scoreAfter: Score,
  /** Engine's preferred move before this move at the checked depth (UCI). */
  bestUci: z.string().optional(),
  /** Main line from `fenBefore` at the checked depth; same rules as `AnalyzedMove.bestLine`. */
  bestLine: z.array(z.string()).max(BEST_LINE_MAX_PLIES).optional(),
  /** Main line from `fenAfter` at the checked depth: the answer to this move. */
  answerLine: z.array(z.string()).max(BEST_LINE_MAX_PLIES).optional(),
  winPctBefore: z.number(),
  winPctAfter: z.number(),
  winPctLoss: z.number(),
  judgment: Judgment,
});
export type MoveCheck = z.infer<typeof MoveCheck>;

export const AnalyzedMove = z.object({
  /** Half-move number from move 1 of a standard game: White's 1st move is 1, Black's 1st is 2. */
  ply: z.number().int().positive(),
  color: Color,
  san: z.string(),
  /** Standard UCI, same notation as `bestUci`: castling is the king's two-square move. */
  uci: z.string(),
  fenBefore: z.string(),
  fenAfter: z.string(),
  /** Engine's preferred move in the position before this move (UCI). Absent at depth 0 / forced lines. */
  bestUci: z.string().optional(),
  /**
   * Engine's main line (PV) from `fenBefore`, in UCI, at most `BEST_LINE_MAX_PLIES` moves.
   * Its first move is always `bestUci`. Absent when there is no best move, or when the PV the
   * engine reported does not start with the move it chose. Added in analysis version 2.
   */
  bestLine: z.array(z.string()).max(BEST_LINE_MAX_PLIES).optional(),
  scoreBefore: Score,
  scoreAfter: Score,
  /** Mover's win probability (0-100) before and after their move. */
  winPctBefore: z.number(),
  winPctAfter: z.number(),
  /** max(0, before - after). */
  winPctLoss: z.number(),
  judgment: Judgment,
  /** Mover's clock after the move, when the PGN carries %clk. */
  clockSeconds: z.number().optional(),
  /** The deeper check, when this move was re-evaluated. */
  check: MoveCheck.optional(),
});
export type AnalyzedMove = z.infer<typeof AnalyzedMove>;

export const AnalyzedGame = z.object({
  gameId: z.string(),
  analysisVersion: z.number().int(),
  engine: z.object({ name: z.string(), depth: z.number().int() }),
  moves: z.array(AnalyzedMove),
  /**
   * Engine's main line (UCI) from the position after the game's last move, at most
   * `BEST_LINE_MAX_PLIES` moves: the answer to a last move that no later move records (a
   * blunder followed by resignation). Same rules as `AnalyzedMove.bestLine`; also absent when
   * the game ended on the board (checkmate, stalemate or another drawn position).
   */
  finalLine: z.array(z.string()).max(BEST_LINE_MAX_PLIES).optional(),
  /** Set once the game's flagged moves were checked deeper, for these colours' moves. */
  check: z
    .object({ depth: z.number().int().positive(), colors: z.array(Color).min(1).max(2) })
    .optional(),
});
export type AnalyzedGame = z.infer<typeof AnalyzedGame>;
