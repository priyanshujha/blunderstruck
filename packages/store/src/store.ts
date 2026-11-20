import type {
  AnalyzedGame,
  GameRecord,
  PeriodStats,
  Platform,
  ReportTimeClass,
  Track,
  WeeklyReport,
} from "@blunderstruck/contracts";

/** Which stored analyses count: the analysis version and depth, and optionally the engine name. */
export interface AnalysisKey {
  analysisVersion: number;
  depth: number;
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
  /** Replaces the stored report only when its revision is higher; otherwise "stale". */
  putReport(r: WeeklyReport): Promise<"stored" | "stale">;
  /** The track's reports, sorted by `periodEnd` ascending. */
  reports(t: Track): Promise<WeeklyReport[]>;
  latestReport(t: Track): Promise<WeeklyReport | undefined>;
  allGames(): AsyncIterable<GameRecord>;
  allAnalyses(): AsyncIterable<AnalyzedGame>;
  /** Every stored report, ordered by (track key, period end). */
  allReports(): AsyncIterable<WeeklyReport>;
  close(): Promise<void>;
}
