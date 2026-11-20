import type {
  PatternFinding,
  PatternPriority,
  PatternSummary,
  RatingBand,
} from "@blunderstruck/contracts";

/** One report week of the player's games: moves played and the findings in them. */
export type WeekFindings = {
  start: string;
  end: string;
  games: number;
  moves: number;
  findings: readonly PatternFinding[];
};

export interface PrioritiesInput {
  /** The report weeks, newest first. */
  weeks: readonly WeekFindings[];
  /** The current period, for its naive cost. */
  current: PatternSummary;
  band: RatingBand;
}

/** Score every pattern by recent cost and persistence, greedily over findings not yet covered. */
export function priorities(input: PrioritiesInput): PatternPriority[] {
  throw new Error("not implemented");
}
