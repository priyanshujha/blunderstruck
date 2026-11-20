import { z } from "zod";
import { AnalyzedGame } from "./analysis";
import { Color, GameRecord, Platform } from "./game";

/**
 * Rating bands decide which advice is allowed: an 800 is never told to study rook endings
 * theory, a 2000 is never told to "check for hanging pieces" as the headline.
 *
 * Bands are on a Chess.com-rapid-like scale. Lichess ratings run higher for the same player;
 * `toBandScale` in `rubric.ts` converts a rating from its pool to this scale first.
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

export const ProgressVerdict = z.enum(["improved", "flat", "worse", "insufficient-data"]);
export type ProgressVerdict = z.infer<typeof ProgressVerdict>;

/** Time classes a report track can follow. Daily and correspondence games are never reported on. */
export const ReportTimeClass = z.enum(["bullet", "blitz", "rapid", "classical"]);
export type ReportTimeClass = z.infer<typeof ReportTimeClass>;

/** One series of reports: one player on one platform in one time class. */
export const Track = z.object({
  platform: Platform,
  username: z.string().min(1),
  timeClass: ReportTimeClass,
});
export type Track = z.infer<typeof Track>;

/** `"<platform>:<username lowercased>:<timeClass>"`, the track's storage key. */
export function trackKey(t: Track): string {
  return `${t.platform}:${t.username.toLowerCase()}:${t.timeClass}`;
}

/** Everything that decides whether two analyses of the same game are comparable. */
export const AnalysisSettings = z.object({
  analysisVersion: z.number().int(),
  patternsVersion: z.number().int(),
  engine: z.object({ name: z.string(), depth: z.number().int() }),
});
export type AnalysisSettings = z.infer<typeof AnalysisSettings>;

/** `"a<analysisVersion>.p<patternsVersion>.d<depth>.<engine name>"`. */
export function settingsKey(s: AnalysisSettings): string {
  return `a${s.analysisVersion}.p${s.patternsVersion}.d${s.engine.depth}.${s.engine.name}`;
}

/** Weeks in a report's look-back window, including the current one. */
export const REPORT_WEEKS = 6;

/** Every pattern's numbers over one stretch of a track's games, analysed at one setting. */
export const PeriodStats = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  games: z.number().int().nonnegative(),
  moves: z.number().int().nonnegative(),
  mistakesPer100Moves: z.number().nonnegative(),
  settings: AnalysisSettings,
  stats: z.array(PatternStat),
});
export type PeriodStats = z.infer<typeof PeriodStats>;

/** One entry per week of the window, newest first; null when the week had too few games to count. */
const WeekFlags = z.array(z.boolean().nullable()).length(REPORT_WEEKS);

/** How steadily a pattern kept coming back over the window. */
export const Persistence = z.object({
  weeksRecurred: z.number().int().nonnegative(),
  weeksCounted: z.number().int().nonnegative(),
  weeks: WeekFlags,
  /** Recency-weighted share of counted weeks in which the pattern recurred. */
  chronicity: z.number().min(0).max(1),
});
export type Persistence = z.infer<typeof Persistence>;

/** A pattern's place in the order of what to work on. Rates and costs are per 100 of the player's moves. */
export const PatternPriority = z.object({
  patternId: z.string(),
  /** Allowed for the player's band, frequent enough this period and not cooling down. */
  eligible: z.boolean(),
  /** 1 is the top pick; null for ineligible patterns. */
  rank: z.number().int().min(1).nullable(),
  rate: z.number(),
  /** Expected win% lost per occurrence. */
  severity: z.number(),
  /** Win% lost per 100 moves, recency-weighted. */
  recentCost: z.number(),
  /** Win% lost per 100 moves in this period alone. Display only. */
  naiveCostThisPeriod: z.number(),
  chronicity: z.number(),
  score: z.number(),
  persistence: Persistence,
});
export type PatternPriority = z.infer<typeof PatternPriority>;

/** Why a focus item is on the list, in numbers the wording may quote only through tokens. */
export const FocusReason = z.object({
  kind: z.enum(["new", "kept", "rose", "returned"]),
  previousRank: z.number().int().nullable(),
  score: z.number(),
  recentCost: z.number(),
  naiveCostThisPeriod: z.number(),
  rate: z.number(),
  severity: z.number(),
  chronicity: z.number(),
  weeksRecurred: z.number().int(),
  weeksCounted: z.number().int(),
  weeks: WeekFlags,
});
export type FocusReason = z.infer<typeof FocusReason>;

/** How one pattern moved between the comparison window and this period. */
export const PatternProgress = z.object({
  patternId: z.string(),
  previous: PatternStat,
  current: PatternStat,
  verdict: ProgressVerdict,
  /** The tail probability behind the verdict; null when there were too few games to test. */
  pValue: z.number().min(0).max(1).nullable(),
});
export type PatternProgress = z.infer<typeof PatternProgress>;

/** A focus item taken off the list, and why. */
export const RetiredFocus = z.object({
  patternId: z.string(),
  why: z.enum(["graduated", "rotated", "outgrown"]),
  since: z.string().datetime(),
  baseline: PatternStat,
  current: PatternStat,
});
export type RetiredFocus = z.infer<typeof RetiredFocus>;

/** How much of the period's games the numbers are built on. */
export const Coverage = z.object({
  sampled: z.number().int().nonnegative(),
  analysed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  /** Every game in `total` is analysed. */
  complete: z.boolean(),
  /** The run stopped after the sample on request. */
  sampleOnly: z.boolean(),
});
export type Coverage = z.infer<typeof Coverage>;

/** Who wrote the report's text. */
export const Wording = z.object({
  source: z.enum(["model", "template"]),
  provider: z.enum(["anthropic", "gemini"]).optional(),
  model: z.string().optional(),
  /** Pattern ids whose text the model wrote. */
  wordedFor: z.array(z.string()).max(MAX_FOCUS_ITEMS),
  /** Model calls made for this period, repairs and rewords included. */
  calls: z.number().int().min(0).max(3),
});
export type Wording = z.infer<typeof Wording>;

export const ReportNote = z.enum(["few-games", "no-key", "model-failed", "sample-only", "settings-changed"]);
export type ReportNote = z.infer<typeof ReportNote>;

/** Tokens a focus item's `title`, `why` and `drill` may use, written `{name}`. */
export const FOCUS_TOKENS = [
  "games",
  "gamesAffected",
  "occurrences",
  "rate",
  "baselineRate",
  "target",
  "weeksRecurred",
  "weeksCounted",
] as const;

/** Tokens a report's `summary` may use. */
export const SUMMARY_TOKENS = ["games", "mistakeRate", "focusCount"] as const;

/**
 * Replaces every `{token}` in `template`. Throws on any braced text that is not exactly a key
 * of `values`, and on any brace left unpaired in the template.
 */
export function renderText(template: string, values: Record<string, string>): string {
  const token = /\{([^{}]*)\}/g;
  const check = (name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) throw new Error(`unknown token {${name}}`);
  };
  const rest = template.replace(token, (_, name: string) => {
    check(name);
    return "";
  });
  if (/[{}]/.test(rest)) throw new Error("unbalanced brace in template");
  return template.replace(token, (_, name: string) => values[name]!);
}

/** A finding shown with its position, for the wording and the report pages. */
export const FocusExample = PatternFinding.extend({
  /** FEN of the position before the player's move. */
  fen: z.string(),
  /** The move played, in SAN. */
  played: z.string(),
  /** The engine's preferred move, in SAN. */
  best: z.string().optional(),
});
export type FocusExample = z.infer<typeof FocusExample>;

export const FocusItem = z.object({
  patternId: z.string(),
  /** Token template (`FOCUS_TOKENS`). */
  title: z.string(),
  /** Why this one, in the player's own numbers. Token template. */
  why: z.string(),
  /** One concrete habit or drill sized for the player's band. Token template. */
  drill: z.string(),
  exampleGameIds: z.array(z.string()).max(3),
  /** The pattern's numbers when it was first chosen; frozen while it stays on the list. */
  baseline: PatternStat,
  /** per100Moves to get down to. */
  target: z.number().nonnegative(),
  /** `periodEnd` of the report that first chose it. */
  since: z.string().datetime(),
  reason: FocusReason,
  /** Largest losses first, separate games first. */
  examples: z.array(FocusExample).max(2),
});
export type FocusItem = z.infer<typeof FocusItem>;

/** A focus item as code chooses it, before any text is written. */
export const FocusChoice = FocusItem.omit({ title: true, why: true, drill: true });
export type FocusChoice = z.infer<typeof FocusChoice>;

export const WeeklyReport = z.object({
  /** Equals `track.username`. */
  player: z.string(),
  track: Track,
  kind: z.enum(["first", "weekly"]),
  /** 0 for the first pass; each later pass over the same period stores a higher revision. */
  revision: z.number().int().nonnegative(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  /** Median rating of the period's games, in the platform's own pool. */
  rating: z.number().int().nullable(),
  band: RatingBand,
  bandSource: z.enum(["ratings", "override", "previous", "default"]),
  settings: AnalysisSettings,
  /** Games in the period, analysed or not. */
  gamesFound: z.number().int().nonnegative(),
  gamesAnalyzed: z.number().int().nonnegative(),
  /** Every game the period holds, so later periods never count one twice. */
  gameIds: z.array(z.string()),
  coverage: Coverage,
  current: PeriodStats,
  /** The 30 days before the period; null on a track's first report. */
  comparison: PeriodStats.nullable(),
  /** The window's weeks, newest first. */
  weeks: z.array(PeriodStats).length(REPORT_WEEKS),
  /** Every pattern against the comparison window; empty without one. */
  trends: z.array(PatternProgress),
  priorities: z.array(PatternPriority),
  /** Never more than two things to work on at once. */
  focus: z.array(FocusItem).max(MAX_FOCUS_ITEMS),
  /** How the previous report's focus items moved in the games played since. */
  progress: z.array(PatternProgress),
  retired: z.array(RetiredFocus),
  /** Token template (`SUMMARY_TOKENS`). */
  summary: z.string(),
  wording: Wording,
  notes: z.array(ReportNote),
});
export type WeeklyReport = z.infer<typeof WeeklyReport>;

/** A report as code assembles it, before any text is written. */
export const ReportDraft = WeeklyReport.omit({ summary: true, wording: true }).extend({
  focus: z.array(FocusChoice).max(MAX_FOCUS_ITEMS),
});
export type ReportDraft = z.infer<typeof ReportDraft>;

const fixed2 = (n: number) => n.toFixed(2);

/** Token values for one focus item, from this period's numbers. Rates have two decimals. */
export function focusTokenValues(
  item: Pick<FocusChoice, "patternId" | "baseline" | "target" | "reason">,
  report: { current: PeriodStats },
): Record<(typeof FOCUS_TOKENS)[number], string> {
  const stat = report.current.stats.find((s) => s.patternId === item.patternId);
  return {
    games: String(stat?.games ?? report.current.games),
    gamesAffected: String(stat?.gamesAffected ?? 0),
    occurrences: String(stat?.occurrences ?? 0),
    rate: fixed2(stat?.per100Moves ?? 0),
    baselineRate: fixed2(item.baseline.per100Moves),
    target: fixed2(item.target),
    weeksRecurred: String(item.reason.weeksRecurred),
    weeksCounted: String(item.reason.weeksCounted),
  };
}

/** Token values for a report's summary. */
export function summaryTokenValues(report: {
  current: PeriodStats;
  focus: readonly unknown[];
}): Record<(typeof SUMMARY_TOKENS)[number], string> {
  return {
    games: String(report.current.games),
    mistakeRate: fixed2(report.current.mistakesPer100Moves),
    focusCount: String(report.focus.length),
  };
}

/** Line 1 of a store export. */
export const EXPORT_FORMAT = "blunderstruck-export";

/** One line of an NDJSON store export. */
export const ExportLine = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("header"),
    format: z.literal(EXPORT_FORMAT),
    schemaVersion: z.number().int().positive(),
    exportedAt: z.string().datetime(),
  }),
  z.object({ type: z.literal("track"), data: Track.extend({ createdAt: z.string().datetime() }) }),
  z.object({ type: z.literal("game"), data: GameRecord }),
  z.object({ type: z.literal("analysis"), data: AnalyzedGame }),
  z.object({ type: z.literal("report"), data: WeeklyReport }),
]);
export type ExportLine = z.infer<typeof ExportLine>;
