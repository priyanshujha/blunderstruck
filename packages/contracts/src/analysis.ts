import { z } from "zod";
import { Color } from "./game";

/** Engine score from White's point of view. `mate: 3` = White mates in 3, `mate: -2` = Black mates in 2. */
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
export const ANALYSIS_VERSION = 1;

export const AnalyzedMove = z.object({
  /** 1-based half-move number. */
  ply: z.number().int().positive(),
  color: Color,
  san: z.string(),
  uci: z.string(),
  fenBefore: z.string(),
  fenAfter: z.string(),
  /** Engine's preferred move in the position before this move (UCI). Absent at depth 0 / forced lines. */
  bestUci: z.string().optional(),
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
});
export type AnalyzedMove = z.infer<typeof AnalyzedMove>;

export const AnalyzedGame = z.object({
  gameId: z.string(),
  analysisVersion: z.number().int(),
  engine: z.object({ name: z.string(), depth: z.number().int() }),
  moves: z.array(AnalyzedMove),
});
export type AnalyzedGame = z.infer<typeof AnalyzedGame>;
