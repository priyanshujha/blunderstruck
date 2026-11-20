import type {
  AnalyzedGame,
  GameRecord,
  PeriodStats,
  Platform,
  ReportTimeClass,
  Track,
  WeeklyReport,
} from "@blunderstruck/contracts";

/**
 * Which stored analyses count: the analysis version, the depth, the depth of the deeper check,
 * and optionally the engine name.
 */
export interface AnalysisKey {
  analysisVersion: number;
  depth: number;
  /**
   * Depth of the deeper check of flagged moves, 0 for an analysis that was not checked. An
   * analysis is stored under `check.depth`, or 0 when it has no `check`, so an unchecked and a
   * checked analysis of the same game coexist and each lookup returns only its own.
   */
  checkDepth: number;
  engineName?: string;
}

export interface GameQuery {
  platform: Platform;
  username: string;
  timeClass?: ReportTimeClass;
  /** Inclusive. */
  from?: string;
  /** Exclusive. */
  to?: string;
}

/**
 * Where games, analyses and reports are kept. Every method is async so that other databases
 * can implement it.
 */
export interface Store {
  putTrack(t: Track, createdAt: string): Promise<void>;
  tracks(): Promise<(Track & { createdAt: string })[]>;
  /** Upsert by game id. */
  putGames(gs: readonly GameRecord[]): Promise<void>;
  /** The player's games, sorted by `(playedAt, id)`. */
  games(q: GameQuery): Promise<GameRecord[]>;
  gamesById(ids: readonly string[]): Promise<Map<string, GameRecord>>;
  getAnalyses(ids: readonly string[], key: AnalysisKey): Promise<Map<string, AnalyzedGame>>;
  analysedIds(ids: readonly string[], key: AnalysisKey): Promise<Set<string>>;
  /** Upsert by game id, analysis version, depth, check depth (`checkDepthOf`) and engine name. */
  putAnalysis(a: AnalyzedGame): Promise<void>;
  /** Weekly stats by period end, for one track and settings key. */
  getPeriodStats(
    trackKey: string,
    settingsKey: string,
    ends: readonly string[],
  ): Promise<Map<string, PeriodStats>>;
  /** Every stored week for one track and settings key, `end` ascending. */
  listPeriodStats(trackKey: string, settingsKey: string): Promise<PeriodStats[]>;
  putPeriodStats(trackKey: string, settingsKey: string, s: PeriodStats): Promise<void>;
  /**
   * Replaces the stored report for the same period only when its revision is higher; otherwise
   * "stale". Stores nothing and returns "conflict" when the report's period overlaps a stored
   * report of the same track with a different period end (periods that only touch are fine).
   */
  putReport(r: WeeklyReport): Promise<"stored" | "stale" | "conflict">;
  /** The track's reports, sorted by `periodEnd` ascending. */
  reports(t: Track): Promise<WeeklyReport[]>;
  latestReport(t: Track): Promise<WeeklyReport | undefined>;
  allGames(): AsyncIterable<GameRecord>;
  allAnalyses(): AsyncIterable<AnalyzedGame>;
  /** Every stored report, ordered by (track key, period end). */
  allReports(): AsyncIterable<WeeklyReport>;
  close(): Promise<void>;
}

/** The check depth an analysis is stored under: its `check.depth`, or 0 when it was not checked. */
export function checkDepthOf(a: Pick<AnalyzedGame, "check">): number {
  return a.check?.depth ?? 0;
}

/**
 * The check depth a lookup asks for. The field is required; a caller from untyped code that
 * leaves it out asks for unchecked analyses, as an absent `AnalysisSettings.checkDepth` means 0.
 */
export function keyCheckDepth(key: AnalysisKey): number {
  return (key as Partial<AnalysisKey>).checkDepth ?? 0;
}
