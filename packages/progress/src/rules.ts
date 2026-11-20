import type { PatternId } from "@blunderstruck/contracts";

/*
 * Every number the progress report uses, in one place. Changing a value changes verdicts,
 * priorities or which games get analysed, so record the change in the commit message.
 */

// The limits below are defined once elsewhere and reused, never redefined.
export { MAX_FOCUS_ITEMS, REPORT_WEEKS } from "@blunderstruck/contracts";
export { TOP_MIN_GAMES, TOP_MIN_OCCURRENCES } from "@blunderstruck/patterns";

// Periods and tracks

/** Length of a report week, in days. */
export const WEEK_DAYS = 7;
/** The first report looks back this many days from `asOf`. */
export const FIRST_LOOKBACK_DAYS = 30;
/** If the first window holds too few games, look back at most this many days. */
export const MAX_LOOKBACK_DAYS = 90;
/** The first report wants at least this many track games. */
export const BASELINE_TARGET_GAMES = 20;
/** Below this many games in a period there is no focus and no model call: numbers only. */
export const MIN_REPORT_GAMES = 10;
/** A later fetch starts this many days before the period start, to catch games that finished late. */
export const FETCH_OVERLAP_DAYS = 3;
/** The most games one fetch asks a platform for. */
export const FETCH_MAX = 20_000;
/** Verdicts compare the period with this many days before it. */
export const COMPARISON_DAYS = 30;
/** Default engine search depth. */
export const DEFAULT_DEPTH = 12;

// Verdict rule

/** A verdict needs at least this many games on each side... */
export const MIN_VERDICT_GAMES = 10;
/** ...and at least this many of the player's moves on each side... */
export const MIN_VERDICT_MOVES = 300;
/** ...and at least this many expected events in the current period. */
export const MIN_EXPECTED_EVENTS = 3;
/** Significance level of the exact one-sided test. */
export const ALPHA = 0.05;
/** The rate must also have moved by at least this share (20%) to count as improved or worse. */
export const MIN_RELATIVE_CHANGE = 0.2;

// Priority formula

/** Recency weight of week `a` is `2^(-a / HALF_LIFE_WEEKS)`. */
export const HALF_LIFE_WEEKS = 3;
/** The reference rate counts as this many moves of prior evidence. */
export const PRIOR_MOVES = 300;
/** Reference rate of each pattern per 100 moves; from a 68-game club sample, all provisional. */
export const REFERENCE_RATES: Record<PatternId, number> = {
  "hung-piece": 1.33,
  "allowed-tactic": 1.66,
  "missed-tactic": 0.66,
  "missed-capture": 0.28,
  "missed-mate": 0.38,
  "allowed-mate": 0.14,
  "thrown-win": 0.52,
  "time-trouble": 0.24,
  "opening-trouble": 0.2,
};
/** Prior mean loss per finding, in win%. */
export const SEVERITY_PRIOR = 25;
/** The severity prior counts as this many findings. */
export const SEVERITY_PRIOR_WEIGHT = 2;
/** A week with fewer games than this is not counted for persistence (its moves and findings still count). */
export const MIN_WEEK_GAMES = 5;
/** With fewer counted weeks than this, chronicity is 0. */
export const MIN_COUNTED_WEEKS = 3;
/** The score is recent cost times `1 + CHRONICITY_WEIGHT * chronicity` (gamma). */
export const CHRONICITY_WEIGHT = 1;

// Focus rules

/**
 * A held item graduates after this many consecutive enough-data reports at its goal in games
 * (`meetsGoal`; the goal is `gameGoalOf(baseline)`, a quarter fewer games affected).
 */
export const GRADUATE_AFTER_REPORTS = 2;
/** A held item may be rotated out after this many enough-data reports without graduating. */
export const ROTATE_AFTER_REPORTS = 6;
/** A graduated or rotated pattern cannot be chosen again for this many final reports. */
export const COOLDOWN_REPORTS = 2;
/**
 * A new item's per-100-move `target` is its starting rate cut by this share (25%). Kept for
 * older readers; graduation is judged on the goal in games.
 */
export const TARGET_REDUCTION = 0.25;
/** A pattern "rose" when its rank in the previous report was this or lower (or it had none). */
export const ROSE_MIN_PREVIOUS_RANK = 3;
/** At most this many example positions per focus item; example `i` shows blind spot `i` when it can. */
export const MAX_EXAMPLES = 2;

// Two-pass analysis

/** The first pass analyses at most this many games, spread evenly over the period. */
export const SAMPLE_GAMES = 150;
/** Each sampling bucket (week) gets at least this many games before the rest are shared out. */
export const SAMPLE_MIN_PER_BUCKET = 5;
