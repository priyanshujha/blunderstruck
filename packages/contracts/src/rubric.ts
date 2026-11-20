import { PATTERN_IDS, type PatternId, type RatingBand, type ReportTimeClass, ratingBand } from "./coach";
import type { Platform } from "./game";

const NOVICE: readonly PatternId[] = ["hung-piece", "missed-capture", "allowed-mate", "missed-mate", "thrown-win"];
const BEGINNER: readonly PatternId[] = [...NOVICE, "allowed-tactic", "missed-tactic", "time-trouble"];
const CLUB: readonly PatternId[] = PATTERN_IDS;
const ADVANCED: readonly PatternId[] = CLUB.filter((id) => id !== "hung-piece" && id !== "missed-capture");
const EXPERT: readonly PatternId[] = ["missed-tactic", "allowed-tactic", "thrown-win", "time-trouble", "opening-trouble"];

/**
 * What each band may be asked to work on, and how simple the advice for it should be. A
 * pattern outside a band's list is still counted and shown; it is just never a focus item.
 */
export const BAND_RUBRIC: Record<RatingBand, { eligible: readonly PatternId[]; adviceLevel: string }> = {
  novice: {
    eligible: NOVICE,
    adviceLevel: "One plain habit per item, said in everyday words, with no notation-heavy study.",
  },
  beginner: {
    eligible: BEGINNER,
    adviceLevel: "One simple checking routine per item, practised on short puzzles, with light notation.",
  },
  club: {
    eligible: CLUB,
    adviceLevel: "A concrete thinking routine and themed puzzle sets, with notation used freely.",
  },
  advanced: {
    eligible: ADVANCED,
    adviceLevel: "Calculation and positional drills on the player's own positions, assuming fluent notation.",
  },
  expert: {
    eligible: EXPERT,
    adviceLevel: "Deep calculation, opening preparation and clock management, at the level of serious training.",
  },
};

export function isEligible(band: RatingBand, patternId: string): boolean {
  return (BAND_RUBRIC[band].eligible as readonly string[]).includes(patternId);
}

/**
 * Points each rating pool runs above the band scale (Chess.com rapid), as "pool minus
 * Chess.com rapid". Provisional: flat offsets derived from the rating comparison tables at
 * https://chessgoals.com/rating-comparison/ (page updated July 2026). The real gap varies
 * across the rating range. Chess.com classical has no data there and uses 0.
 */
export const RATING_POOL_OFFSETS: Record<Platform, Record<ReportTimeClass, number>> = {
  chesscom: { bullet: -300, blitz: -200, rapid: 0, classical: 0 },
  lichess: { bullet: 100, blitz: 150, rapid: 300, classical: 350 },
};

/** A rating from its own pool, moved onto the band scale. */
export function toBandScale(platform: Platform, timeClass: ReportTimeClass, rating: number): number {
  return rating - RATING_POOL_OFFSETS[platform][timeClass];
}

/** Median of the ratings, rounded; with an even count, the mean of the two middle ones. Null when empty. */
export function medianRating(ratings: readonly number[]): number | null {
  const sorted = ratings.filter((r) => Number.isFinite(r)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(median);
}

/** The band for a period's ratings in one pool: median, converted to the band scale. Null when empty. */
export function bandFromRatings(
  platform: Platform,
  timeClass: ReportTimeClass,
  ratings: readonly number[],
): RatingBand | null {
  const median = medianRating(ratings);
  return median === null ? null : ratingBand(toBandScale(platform, timeClass, median));
}
