import { z } from "zod";
import { Color } from "./game";

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

/**
 * Recurring-mistake patterns the engine detects, in priority order: when one move matches
 * several, the earliest id wins. `PatternFinding.patternId` stays a plain string so stored
 * findings from other versions still parse.
 */
export const PATTERN_IDS = [
  "missed-mate",
  "allowed-mate",
  "hung-piece",
  "allowed-tactic",
  "missed-capture",
  "missed-tactic",
  "thrown-win",
  "time-trouble",
  "opening-trouble",
] as const;
export const PatternId = z.enum(PATTERN_IDS);
export type PatternId = z.infer<typeof PatternId>;

/** Bump when detector rules change in a way that makes old pattern summaries incomparable. */
export const PATTERNS_VERSION = 1;

/** The tactic behind an `allowed-tactic` or `missed-tactic` finding, when it can be named. */
export const TacticMotif = z.enum(["fork", "discovered-attack", "mate"]);
export type TacticMotif = z.infer<typeof TacticMotif>;

/** One detected instance of a recurring-mistake pattern in one game. */
export const PatternFinding = z.object({
  patternId: z.string(),
  gameId: z.string(),
  ply: z.number().int().positive(),
  /** Win-probability points the mistake cost. */
  winPctLoss: z.number(),
  /** Short machine-written fact, e.g. "knight on f6 left undefended, taken next move". */
  evidence: z.string().optional(),
  /** Set only on the tactic patterns, when the motif is recognised. */
  motif: TacticMotif.optional(),
  /** What the finding is about when it is not just the move, e.g. the position key for `opening-trouble`. */
  subject: z.string().optional(),
});
export type PatternFinding = z.infer<typeof PatternFinding>;

/** A pattern's frequency over a set of games. Rates, not counts, so periods of different size compare. */
export const PatternStat = z.object({
  patternId: z.string(),
  games: z.number().int().nonnegative(),
  /** The player's own moves counted: the sample size behind `per100Moves`. */
  moves: z.number().int().nonnegative(),
  /** Games with at least one occurrence. */
  gamesAffected: z.number().int().nonnegative(),
  occurrences: z.number().int().nonnegative(),
  /** Occurrences per 100 of the player's own moves. */
  per100Moves: z.number().nonnegative(),
  avgWinPctLoss: z.number().nonnegative(),
});
export type PatternStat = z.infer<typeof PatternStat>;

/** A position early in the game where the player went wrong in more than one game. */
export const OpeningStat = z.object({
  /** The first four FEN fields of the position before the mistake. */
  positionKey: z.string(),
  color: Color,
  /** Moves from the start position to `positionKey`, in SAN. */
  line: z.array(z.string()),
  /** For display only, from the game record; the key is the position. */
  eco: z.string().optional(),
  name: z.string().optional(),
  /** Games with a countable mistake in this position. */
  games: z.number().int().nonnegative(),
  /** Games in which the player faced this position at all. */
  reached: z.number().int().nonnegative(),
  /** The player's moves here (SAN), one per game with a mistake. */
  movesPlayed: z.array(z.string()),
  /** Engine's preferred move here (SAN). */
  bestMove: z.string().optional(),
  avgWinPctLoss: z.number().nonnegative(),
  gameIds: z.array(z.string()),
});
export type OpeningStat = z.infer<typeof OpeningStat>;

/**
 * The most things a player is given to work on at once: weekly focus items and the top habits
 * a pattern summary leads with. Every pattern is still counted; only the highlight is capped.
 */
export const MAX_FOCUS_ITEMS = 2;

/** One of the player's leading habits, ranked by the win% it costs that earlier picks do not explain. */
export const TopHabit = z.object({
  patternId: z.string(),
  /** Win-percentage points lost per 100 of the player's moves, not counting plies already explained. */
  costPer100Moves: z.number().nonnegative(),
  gamesAffected: z.number().int().nonnegative(),
  /** Largest losses first, separate games first. */
  examples: z.array(PatternFinding).max(2),
});
export type TopHabit = z.infer<typeof TopHabit>;

/** Every pattern over one set of a player's games. */
export const PatternSummary = z.object({
  player: z.string(),
  patternsVersion: z.number().int(),
  analysisVersion: z.number().int(),
  engine: z.object({ name: z.string(), depth: z.number().int() }),
  games: z.number().int().nonnegative(),
  /** The player's own moves across those games. */
  moves: z.number().int().nonnegative(),
  /** Mistakes (moves losing at least the mistake threshold) per 100 moves, labelled or not. */
  mistakesPer100Moves: z.number().nonnegative(),
  stats: z.array(PatternStat),
  findings: z.array(PatternFinding),
  openings: z.array(OpeningStat),
  /** At most `MAX_FOCUS_ITEMS` habits to lead with; empty when none repeats in two or more games. */
  top: z.array(TopHabit).max(MAX_FOCUS_ITEMS),
});
export type PatternSummary = z.infer<typeof PatternSummary>;

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
  focus: z.array(FocusItem).max(MAX_FOCUS_ITEMS),
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
