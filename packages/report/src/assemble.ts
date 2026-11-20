import {
  bandFromRatings,
  medianRating,
  PATTERN_IDS,
  perspective,
  settingsKey,
  trackKey,
  type AnalysisSettings,
  type AnalyzedGame,
  type FocusChoice,
  type GameRecord,
  type PatternProgress,
  type PatternStat,
  type PatternSummary,
  type PeriodStats,
  type RatingBand,
  type ReportDraft,
  type ReportNote,
  type Track,
  type WeeklyReport,
} from "@blunderstruck/contracts";
import { summarize, toPlayerGame, type PlayerGame } from "@blunderstruck/patterns";
import {
  chooseFocus,
  COMPARISON_DAYS,
  cooldownPatterns,
  MIN_REPORT_GAMES,
  priorities,
  SAMPLE_GAMES,
  selectGames,
  verdict,
  weekBuckets,
  type WeekFindings,
} from "@blunderstruck/progress";
import type { AnalysisKey, Store } from "@blunderstruck/store";
import { analysisKey } from "./analyse";
import { byPlayedAtThenId, iso, latestRevisions } from "./periods";

const DAY_MS = 24 * 60 * 60 * 1000;
const ms = (s: string): number => Date.parse(s);

/** The games a report's numbers are built from, and which of them are still unanalysed. */
export interface ReportGames {
  /** Every game of the period, `(playedAt, id)` order. */
  period: GameRecord[];
  /** The period after `--max-games` (`coverage.total` games). */
  capped: GameRecord[];
  /** The first-pass sample of `capped`. */
  sample: GameRecord[];
  /** Track games of the comparison window, not in the period; empty on a first report. */
  comparison: GameRecord[];
  /** Track games of the six weeks that are not in the period. */
  weeksOutside: GameRecord[];
  /** Every game the report needs that has no analysis at its settings, `(playedAt, id)` order. */
  pending: GameRecord[];
}

/** The comparison window `[periodStart - 30 d, periodStart)` of a weekly report. */
export function comparisonWindow(periodStart: string): { start: string; end: string } {
  return { start: iso(ms(periodStart) - COMPARISON_DAYS * DAY_MS), end: iso(periodStart) };
}

/** The games a period's numbers use: all of them, or the `selectGames` cut to `total`. */
function cappedOf(period: GameRecord[], total: number, periodEnd: string): GameRecord[] {
  return total < period.length ? selectGames(period, total, periodEnd) : period;
}

/** A period's games found in the store, `(playedAt, id)` order. */
async function periodGames(store: Store, ids: readonly string[]): Promise<GameRecord[]> {
  const byId = await store.gamesById(ids);
  const period = ids.map((id) => byId.get(id)).filter((g): g is GameRecord => g !== undefined);
  return period.sort(byPlayedAtThenId);
}

/**
 * Games another stored report of the track left out with `--max-games`: those in its
 * `gameIds` that are not in its cut, `cappedOf(its games, coverage.total, periodEnd)`. This is
 * the same rule that report's own numbers were built with, so it does not depend on what has
 * been analysed since. Such games are never analysed or counted again.
 */
export async function cutGameIds(store: Store, track: Track, periodEnd: string): Promise<Set<string>> {
  const cut = new Set<string>();
  for (const r of latestRevisions(await store.reports(track))) {
    if (ms(r.periodEnd) === ms(periodEnd) || r.coverage.total >= r.gameIds.length) continue;
    const kept = new Set(cappedOf(await periodGames(store, r.gameIds), r.coverage.total, r.periodEnd).map((g) => g.id));
    for (const id of r.gameIds) if (!kept.has(id)) cut.add(id);
  }
  return cut;
}

/**
 * Collect the games a report needs from the store: the period (`periodIds`, capped to `total`
 * with `selectGames`), the comparison window (weekly reports only) and the six weeks ending at
 * `periodEnd`. Games of the period never count in the comparison window too, and games that
 * any report (this one or another) left out with `--max-games` never count. `pending` lists
 * those with no analysis matching `key`.
 */
export async function reportGames(input: {
  store: Store;
  track: Track;
  kind: "first" | "weekly";
  periodStart: string;
  periodEnd: string;
  periodIds: readonly string[];
  total: number;
  /** Which analyses count as done. */
  key: AnalysisKey;
}): Promise<ReportGames> {
  const { store, track, periodStart, periodEnd } = input;
  const period = await periodGames(store, input.periodIds);
  const capped = cappedOf(period, input.total, periodEnd);
  const sample = selectGames(capped, SAMPLE_GAMES, periodEnd);
  const inPeriod = new Set(input.periodIds);
  const cut = await cutGameIds(store, track, periodEnd);

  const q = { platform: track.platform, username: track.username, timeClass: track.timeClass };
  const rated = (gs: GameRecord[]) => gs.filter((g) => g.rated && !inPeriod.has(g.id) && !cut.has(g.id));
  let comparison: GameRecord[] = [];
  if (input.kind === "weekly") {
    const w = comparisonWindow(periodStart);
    comparison = rated(await store.games({ ...q, from: w.start, to: w.end }));
  }
  const weeks = weekBuckets(periodEnd);
  const oldest = weeks[weeks.length - 1]!.start;
  // Weeks are open on the old side and closed on the new one; the store's range is the reverse.
  const weekGames = (await store.games({ ...q, from: oldest, to: iso(ms(periodEnd) + 1) })).filter(
    (g) => ms(g.playedAt) > ms(oldest) && ms(g.playedAt) <= ms(periodEnd),
  );
  const weeksOutside = rated(weekGames);

  const needed = new Map<string, GameRecord>();
  for (const g of [...capped, ...comparison, ...weeksOutside]) needed.set(g.id, g);
  const done = await store.analysedIds([...needed.keys()], input.key);
  const pending = [...needed.values()].filter((g) => !done.has(g.id)).sort(byPlayedAtThenId);
  return { period, capped, sample, comparison, weeksOutside, pending };
}

/** A summary of the player's analysed games among `games`, plus how many games and moves it covers. */
function summaryOf(username: string, games: readonly GameRecord[], analyses: ReadonlyMap<string, AnalyzedGame>): PatternSummary {
  const pgs: PlayerGame[] = [];
  for (const g of games) {
    const a = analyses.get(g.id);
    if (!a) continue;
    const pg = toPlayerGame(g, a, username);
    if (pg) pgs.push(pg);
  }
  return summarize(username, pgs);
}

/** One `PeriodStats` row from a summary. */
export function periodStatsOf(summary: PatternSummary, start: string, end: string, settings: AnalysisSettings): PeriodStats {
  return {
    start: iso(start),
    end: iso(end),
    games: summary.games,
    moves: summary.moves,
    mistakesPer100Moves: summary.mistakesPer100Moves,
    settings,
    stats: summary.stats,
  };
}

/** A pattern's stat in a period, or a zero stat over the period's games when it never occurred. */
function statIn(s: { games: number; moves: number; stats: readonly PatternStat[] }, patternId: string): PatternStat {
  return (
    s.stats.find((x) => x.patternId === patternId) ?? {
      patternId,
      games: s.games,
      moves: s.moves,
      gamesAffected: 0,
      occurrences: 0,
      per100Moves: 0,
      avgWinPctLoss: 0,
    }
  );
}

/** Every pattern of the period against the comparison window; empty without one. */
export function trendsOf(current: PeriodStats, comparison: PeriodStats | null): PatternProgress[] {
  if (!comparison) return [];
  return PATTERN_IDS.map((id) => {
    const previous = statIn(comparison, id);
    const cur = statIn(current, id);
    const v = verdict(previous, cur);
    return { patternId: id, previous, current: cur, verdict: v.verdict, pValue: v.pValue };
  });
}

/** The period's band: `--band`, else the median rating of all its games, else the previous report's, else club. */
export function bandOf(
  track: Track,
  games: readonly GameRecord[],
  override: RatingBand | undefined,
  previous: WeeklyReport | undefined,
): { rating: number | null; band: RatingBand; bandSource: WeeklyReport["bandSource"] } {
  const ratings: number[] = [];
  for (const g of games) {
    const r = perspective(g, track.username)?.rating;
    if (r !== undefined) ratings.push(r);
  }
  const rating = medianRating(ratings);
  if (override) return { rating, band: override, bandSource: "override" };
  const fromRatings = bandFromRatings(track.platform, track.timeClass, ratings);
  if (fromRatings) return { rating, band: fromRatings, bandSource: "ratings" };
  if (previous) return { rating, band: previous.band, bandSource: "previous" };
  return { rating, band: "club", bandSource: "default" };
}

export interface DraftInput {
  store: Store;
  track: Track;
  kind: "first" | "weekly";
  revision: number;
  periodStart: string;
  periodEnd: string;
  /** Every game id of the period, sampled or not. */
  periodIds: readonly string[];
  /** Games the period is reduced to (`--max-games`), else the period's size. */
  total: number;
  settings: AnalysisSettings;
  /** `--band`, when given. */
  band?: RatingBand;
  /** The track's stored reports; only those ending before `periodEnd` count. */
  history: readonly WeeklyReport[];
  /** Stop after the sample; kept only while something is still pending. */
  sampleOnly: boolean;
  /** Notes decided by the caller ("settings-changed"); "few-games" and "sample-only" are set here. */
  notes: readonly ReportNote[];
}

export interface Draft {
  draft: ReportDraft;
  /** Games the report still needs analysed, `(playedAt, id)` order. */
  pending: GameRecord[];
  /** The six weekly rows, newest first. */
  weeks: PeriodStats[];
  /** A weekly report under `MIN_REPORT_GAMES` games: the final report its focus items were carried from. */
  carriedFrom?: WeeklyReport;
}

/**
 * Build a report draft from whatever is analysed at `input.settings` now: the period's
 * numbers, the comparison window, the six weeks, trends, priorities, focus, progress and
 * retirements. `coverage.complete` is true when nothing the report needs is pending. Under
 * `MIN_REPORT_GAMES` games the draft notes "few-games", retires nothing and adds nothing: a
 * first report has no focus items, and a weekly one carries the previous final report's items
 * forward as "kept" (same `since`, `baseline` and `target`, fresh reason numbers), with their
 * progress entries. Their verdicts are "insufficient-data", so such a report counts neither
 * toward graduation nor rotation.
 */
export async function buildDraft(input: DraftInput): Promise<Draft> {
  const { store, track, settings, periodStart, periodEnd } = input;
  const end = iso(periodEnd);
  const games = await reportGames({ ...input, key: analysisKey(settings) });
  const all = [...games.capped, ...games.comparison, ...games.weeksOutside];
  const analyses = await store.getAnalyses(
    all.map((g) => g.id),
    analysisKey(settings),
  );

  const history = input.history.filter((r) => ms(r.periodEnd) < ms(end));
  const previous = [...history].sort((a, b) => ms(a.periodEnd) - ms(b.periodEnd) || a.revision - b.revision).at(-1);

  const currentSummary = summaryOf(track.username, games.capped, analyses);
  const current = periodStatsOf(currentSummary, periodStart, end, settings);

  let comparison: PeriodStats | null = null;
  if (input.kind === "weekly") {
    const w = comparisonWindow(periodStart);
    comparison = periodStatsOf(summaryOf(track.username, games.comparison, analyses), w.start, w.end, settings);
  }

  const weekGamesPool = [...games.capped, ...games.weeksOutside];
  const weekRows: PeriodStats[] = [];
  const weekFindings: WeekFindings[] = [];
  for (const b of weekBuckets(end)) {
    const inWeek = weekGamesPool.filter((g) => ms(g.playedAt) > ms(b.start) && ms(g.playedAt) <= ms(b.end));
    const s = summaryOf(track.username, inWeek, analyses);
    weekRows.push(periodStatsOf(s, b.start, b.end, settings));
    weekFindings.push({ start: b.start, end: b.end, games: s.games, moves: s.moves, findings: s.findings });
  }

  const { rating, band, bandSource } = bandOf(track, games.period, input.band, previous);
  const cooldown = cooldownPatterns(history, end);
  const ranked = priorities({ weeks: weekFindings, current: currentSummary, band, cooldown });
  const periodAnalyses = new Map<string, AnalyzedGame>();
  for (const g of games.capped) {
    const a = analyses.get(g.id);
    if (a) periodAnalyses.set(g.id, a);
  }
  const decided = chooseFocus({
    current: currentSummary,
    comparison,
    priorities: ranked,
    band,
    history,
    periodEnd: end,
    analyses: periodAnalyses,
  });

  const few = games.capped.length < MIN_REPORT_GAMES;
  const prevFinal = latestRevisions(history).filter(isFinal).at(-1);
  const carriedFrom = few && input.kind === "weekly" && prevFinal && prevFinal.focus.length > 0 ? prevFinal : undefined;
  const focus = few ? (carriedFrom ? carryForward(carriedFrom, decided.focus) : []) : decided.focus;

  const sampleOnly = input.sampleOnly && games.pending.length > 0;
  const notes: ReportNote[] = input.notes.filter((n) => n !== "sample-only");
  if (sampleOnly) notes.push("sample-only");
  if (few && !notes.includes("few-games")) notes.push("few-games");
  const analysed = games.capped.filter((g) => analyses.has(g.id)).length;

  const draft: ReportDraft = {
    player: track.username,
    track,
    kind: input.kind,
    revision: input.revision,
    periodStart: iso(periodStart),
    periodEnd: end,
    rating,
    band,
    bandSource,
    settings,
    gamesFound: games.period.length,
    gamesAnalyzed: analysed,
    gameIds: games.period.map((g) => g.id),
    coverage: {
      sampled: games.sample.length,
      analysed,
      total: games.capped.length,
      complete: games.pending.length === 0,
      sampleOnly,
    },
    current,
    comparison,
    weeks: weekRows,
    trends: trendsOf(current, comparison),
    priorities: ranked,
    focus,
    progress: decided.progress,
    retired: few ? [] : decided.retired,
    notes,
  };
  return { draft, pending: games.pending, weeks: weekRows, ...(carriedFrom ? { carriedFrom } : {}) };
}

/**
 * The items of `from` as "kept" items: `chooseFocus`'s kept choice where it made one (fresh
 * reason numbers and examples), else the stored item with its kind set to "kept".
 */
function carryForward(from: WeeklyReport, decided: readonly FocusChoice[]): FocusChoice[] {
  return from.focus.map((item) => {
    const kept = decided.find((f) => f.patternId === item.patternId && f.reason.kind === "kept");
    if (kept) return kept;
    const { title: _t, why: _w, drill: _d, ...choice } = item;
    return { ...choice, reason: { ...item.reason, kind: "kept" as const } };
  });
}

/**
 * A few-games report's wording: each item carried from `from` keeps its text there. Which
 * items count as model-worded follows `from`; the summary stays the report's own (template).
 * No model call is made for it.
 */
export function carryWording(report: WeeklyReport, from: WeeklyReport): WeeklyReport {
  const texts = new Map(from.focus.map((f) => [f.patternId, f]));
  const focus = report.focus.map((f) => {
    const t = texts.get(f.patternId);
    return t ? { ...f, title: t.title, why: t.why, drill: t.drill } : f;
  });
  const modelIds = from.wording.source === "model" ? from.wording.wordedFor : [];
  const wordedFor = focus.map((f) => f.patternId).filter((id) => modelIds.includes(id));
  const meta = from.wording.provider
    ? { provider: from.wording.provider, ...(from.wording.model ? { model: from.wording.model } : {}) }
    : {};
  const wording = wordedFor.length > 0
    ? { source: "model" as const, ...meta, wordedFor, calls: report.wording.calls }
    : { source: "template" as const, wordedFor: [], calls: report.wording.calls };
  return { ...report, focus, wording };
}

/** A report is final once nothing is pending or the run stopped after the sample on request. */
export const isFinal = (r: Pick<WeeklyReport, "coverage">): boolean => r.coverage.complete || r.coverage.sampleOnly;

/** Store a final report's weekly rows (one per week, keyed by the report's settings). Provisional reports write none. */
export async function storeWeekRows(store: Store, report: WeeklyReport): Promise<void> {
  if (!isFinal(report)) return;
  const tk = trackKey(report.track);
  const sk = settingsKey(report.settings);
  for (const w of report.weeks) await store.putPeriodStats(tk, sk, w);
}

/** Games a stored report still needs analysed at its own settings. */
export async function pendingFor(store: Store, report: WeeklyReport): Promise<GameRecord[]> {
  const games = await reportGames({
    store,
    track: report.track,
    kind: report.kind,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    periodIds: report.gameIds,
    total: report.coverage.total,
    key: analysisKey(report.settings),
  });
  return games.pending;
}
