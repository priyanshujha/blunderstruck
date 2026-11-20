import type {
  AnalyzedGame,
  FocusChoice,
  PatternPriority,
  PatternProgress,
  PatternSummary,
  PeriodStats,
  RatingBand,
  RetiredFocus,
  WeeklyReport,
} from "@blunderstruck/contracts";

export interface FocusInput {
  current: PatternSummary;
  /** The comparison window, or null for a first report. */
  comparison: PeriodStats | null;
  priorities: readonly PatternPriority[];
  band: RatingBand;
  /** The track's stored reports, oldest first. */
  history: readonly WeeklyReport[];
  periodEnd: string;
  /** Analysed games of the period by game id, for the example positions of new items. */
  analyses: ReadonlyMap<string, AnalyzedGame>;
}

export interface FocusDecision {
  focus: FocusChoice[];
  retired: RetiredFocus[];
  progress: PatternProgress[];
}

/** Keep, graduate, rotate or retire the previous items, then fill free slots by priority. */
export function chooseFocus(input: FocusInput): FocusDecision {
  throw new Error("not implemented");
}
