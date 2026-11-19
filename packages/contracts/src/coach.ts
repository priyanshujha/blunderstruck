import { z } from "zod";

/**
 * Rating bands decide which advice is allowed: an 800 is never told to study rook endings
 * theory, a 2000 is never told to "check for hanging pieces" as the headline.
 *
 * Bands are on a Chess.com-rapid-like scale. Lichess ratings run higher for the same player;
 * converting between pools is a pattern-engine concern (docs/architecture.md, "Open questions").
 */
export const RATING_BANDS = [
  { id: "novice", maxRating: 799 },
  { id: "beginner", maxRating: 1199 },
  { id: "club", maxRating: 1599 },
  { id: "advanced", maxRating: 1999 },
  { id: "expert", maxRating: Number.POSITIVE_INFINITY },
] as const;

export const RatingBand = z.enum(["novice", "beginner", "club", "advanced", "expert"]);
export type RatingBand = z.infer<typeof RatingBand>;

export function ratingBand(rating: number): RatingBand {
  return RATING_BANDS.find((b) => rating <= b.maxRating)!.id;
}

/** One detected instance of a recurring-mistake pattern in one game. */
export const PatternFinding = z.object({
  patternId: z.string(),
  gameId: z.string(),
  ply: z.number().int().positive(),
  /** Win-probability points the mistake cost. */
  winPctLoss: z.number(),
  /** Short machine-written fact, e.g. "knight on f6 left undefended, taken next move". */
  evidence: z.string().optional(),
});
export type PatternFinding = z.infer<typeof PatternFinding>;

/** A pattern's frequency over a set of games. Rates, not counts, so periods of different size compare. */
export const PatternStat = z.object({
  patternId: z.string(),
  games: z.number().int().nonnegative(),
  occurrences: z.number().int().nonnegative(),
  /** Occurrences per 100 of the player's own moves. */
  per100Moves: z.number().nonnegative(),
  avgWinPctLoss: z.number().nonnegative(),
});
export type PatternStat = z.infer<typeof PatternStat>;

export const FocusItem = z.object({
  patternId: z.string(),
  title: z.string(),
  /** Why this one, in the player's own numbers. */
  why: z.string(),
  /** One concrete habit or drill sized for the player's band. */
  drill: z.string(),
  exampleGameIds: z.array(z.string()).max(3),
  baseline: PatternStat,
  /** per100Moves to beat by the next report. */
  target: z.number().nonnegative(),
});
export type FocusItem = z.infer<typeof FocusItem>;

export const ProgressVerdict = z.enum(["improved", "flat", "worse", "insufficient-data"]);
export type ProgressVerdict = z.infer<typeof ProgressVerdict>;

export const WeeklyReport = z.object({
  player: z.string(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  band: RatingBand,
  gamesAnalyzed: z.number().int().nonnegative(),
  /** Product rule: never more than two things to work on at once. */
  focus: z.array(FocusItem).max(2),
  /** How the previous report's focus items moved in the games played since. */
  progress: z.array(
    z.object({
      patternId: z.string(),
      previous: PatternStat,
      current: PatternStat,
      verdict: ProgressVerdict,
    }),
  ),
});
export type WeeklyReport = z.infer<typeof WeeklyReport>;
