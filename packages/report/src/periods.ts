import {
  perspective,
  ReportTimeClass,
  type GameRecord,
  type Platform,
  type Track,
  type WeeklyReport,
} from "@blunderstruck/contracts";
import {
  BASELINE_TARGET_GAMES,
  COMPARISON_DAYS,
  FETCH_OVERLAP_DAYS,
  FIRST_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
  MIN_REPORT_GAMES,
  weekBuckets,
} from "@blunderstruck/progress";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A bad option value, such as an `asOf` earlier than the track's latest report. */
export class ReportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportInputError";
  }
}

/** Order in which equal counts pick a time class: slower first, bullet last. */
export const TIME_CLASS_TIE_ORDER: readonly ReportTimeClass[] = ["rapid", "blitz", "classical", "bullet"];

export const iso = (s: string | number | Date): string => new Date(s).toISOString();
const ms = (s: string): number => Date.parse(s);
const daysBefore = (at: string, days: number): string => iso(ms(at) - days * DAY_MS);

export const byPlayedAtThenId = (a: GameRecord, b: GameRecord): number =>
  ms(a.playedAt) - ms(b.playedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Rated games the player played in a reportable time class, no later than `asOf`, in `(playedAt, id)` order. */
export function reportableGames(games: readonly GameRecord[], username: string, asOf: string): GameRecord[] {
  const end = ms(asOf);
  const byId = new Map<string, GameRecord>();
  for (const g of games) {
    if (!g.rated || !ReportTimeClass.safeParse(g.timeClass).success) continue;
    if (ms(g.playedAt) > end || !perspective(g, username)) continue;
    byId.set(g.id, g);
  }
  return [...byId.values()].sort(byPlayedAtThenId);
}

/**
 * The time class for a player's first track: the one with the most reportable games in the
 * `FIRST_LOOKBACK_DAYS` before `asOf`, else in the `MAX_LOOKBACK_DAYS` before it. Ties go
 * to the slower class (`TIME_CLASS_TIE_ORDER`). Null when there are no games at all.
 */
export function pickTimeClass(games: readonly GameRecord[], username: string, asOf: string): ReportTimeClass | null {
  const mine = reportableGames(games, username, asOf);
  for (const days of [FIRST_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS]) {
    const from = ms(daysBefore(asOf, days));
    const counts = new Map<ReportTimeClass, number>();
    for (const g of mine) {
      if (ms(g.playedAt) < from) continue;
      const tc = g.timeClass as ReportTimeClass;
      counts.set(tc, (counts.get(tc) ?? 0) + 1);
    }
    let best: ReportTimeClass | null = null;
    for (const tc of TIME_CLASS_TIE_ORDER) {
      const n = counts.get(tc) ?? 0;
      if (n > 0 && (best === null || n > (counts.get(best) ?? 0))) best = tc;
    }
    if (best) return best;
  }
  return null;
}

/**
 * Which stored track a run follows. With `timeClass`, that track (new when not stored yet).
 * Otherwise the player's only track, or the one with the most recent report when there are
 * several (`others` lists the rest). Undefined when the player has no track and no time class
 * was asked for: the caller picks one from the fetched games.
 */
export function chooseTrack(input: {
  platform: Platform;
  username: string;
  timeClass?: ReportTimeClass;
  /** Every stored track, with the `periodEnd` of its latest report (if any). */
  tracks: readonly { track: Track; latestEnd?: string }[];
}): { track: Track; isNew: boolean; others: Track[] } | undefined {
  const u = input.username.toLowerCase();
  const mine = input.tracks
    .filter((t) => t.track.platform === input.platform && t.track.username.toLowerCase() === u)
    .sort((a, b) => {
      const ea = a.latestEnd ? ms(a.latestEnd) : Number.NEGATIVE_INFINITY;
      const eb = b.latestEnd ? ms(b.latestEnd) : Number.NEGATIVE_INFINITY;
      return eb - ea || TIME_CLASS_TIE_ORDER.indexOf(a.track.timeClass) - TIME_CLASS_TIE_ORDER.indexOf(b.track.timeClass);
    });
  if (input.timeClass) {
    const found = mine.find((t) => t.track.timeClass === input.timeClass);
    const others = mine.filter((t) => t !== found).map((t) => t.track);
    return found
      ? { track: found.track, isNew: false, others }
      : { track: { platform: input.platform, username: input.username, timeClass: input.timeClass }, isNew: true, others };
  }
  const [first, ...rest] = mine;
  return first ? { track: first.track, isNew: false, others: rest.map((t) => t.track) } : undefined;
}

/** Latest revision of each period, `periodEnd` ascending. */
export function latestRevisions(reports: readonly WeeklyReport[]): WeeklyReport[] {
  const byEnd = new Map<string, WeeklyReport>();
  for (const r of reports) {
    const key = iso(r.periodEnd);
    const seen = byEnd.get(key);
    if (!seen || r.revision > seen.revision) byEnd.set(key, r);
  }
  return [...byEnd.values()].sort((a, b) => ms(a.periodEnd) - ms(b.periodEnd));
}

/** When the next fetch for a track should start: the first report's look-back, or the overlap before the next period. */
export function fetchSince(reports: readonly WeeklyReport[], asOf: string): string {
  const latest = latestRevisions(reports).at(-1);
  return latest ? daysBefore(latest.periodEnd, FETCH_OVERLAP_DAYS) : daysBefore(asOf, MAX_LOOKBACK_DAYS);
}

/** Throws `ReportInputError` when `asOf` is earlier than the track's latest `periodEnd`. */
export function checkAsOf(reports: readonly WeeklyReport[], asOf: string): void {
  if (Number.isNaN(ms(asOf))) throw new ReportInputError(`not a date: ${asOf}`);
  const latest = latestRevisions(reports).at(-1);
  if (latest && ms(asOf) < ms(latest.periodEnd)) {
    throw new ReportInputError(
      `--as-of ${iso(asOf)} is earlier than the latest report on this track (${iso(latest.periodEnd)})`,
    );
  }
}

export interface ReportPeriod {
  status: "report";
  kind: "first" | "weekly";
  periodStart: string;
  periodEnd: string;
  /** Every game of the period, `(playedAt, id)` order. */
  games: GameRecord[];
  gameIds: string[];
  /** `[start, end)`; null on a first report. */
  comparison: { start: string; end: string } | null;
  /** `(start, end]`, newest first. */
  weeks: { start: string; end: string }[];
  /** The latest stored report before this one, if any. */
  previous?: WeeklyReport;
}

export interface QuietPeriod {
  /** "unchanged": no new games. "waiting": some, but fewer than a report needs. */
  status: "unchanged" | "waiting";
  latest?: WeeklyReport;
  newGames: number;
  needed: number;
}

export type PeriodOutcome = ReportPeriod | QuietPeriod;

/**
 * Decide the period a run reports on (section "Periods and tracks"), from the track's stored
 * reports, the games fetched for it and `asOf`. Pure: no clock, no store.
 *
 * First report: `periodEnd = asOf`; the `FIRST_LOOKBACK_DAYS` before it when they hold
 * `BASELINE_TARGET_GAMES`, else back to the `BASELINE_TARGET_GAMES`-th newest game within
 * `MAX_LOOKBACK_DAYS`, else the whole `MAX_LOOKBACK_DAYS`. A first report is made with any
 * number of games above zero.
 *
 * Later report: from the latest report's `periodEnd` to `asOf`; the period's games are the
 * fetched track games since `periodStart - FETCH_OVERLAP_DAYS` that no earlier report lists.
 * Zero new games is "unchanged"; fewer than `MIN_REPORT_GAMES` is "waiting" unless `force`.
 * An `asOf` equal to the latest `periodEnd` cannot open a new period, so it is "unchanged".
 */
export function planPeriod(input: {
  track: Track;
  reports: readonly WeeklyReport[];
  games: readonly GameRecord[];
  asOf: string;
  force: boolean;
}): PeriodOutcome {
  const asOf = iso(input.asOf);
  checkAsOf(input.reports, asOf);
  const { track } = input;
  const trackGames = reportableGames(input.games, track.username, asOf).filter((g) => g.timeClass === track.timeClass);
  const history = latestRevisions(input.reports);
  const previous = history.at(-1);
  const weeks = weekBuckets(asOf);

  if (!previous) {
    const within = (days: number) => trackGames.filter((g) => ms(g.playedAt) >= ms(daysBefore(asOf, days)));
    const recent = within(FIRST_LOOKBACK_DAYS);
    let periodStart: string;
    if (recent.length >= BASELINE_TARGET_GAMES) {
      periodStart = daysBefore(asOf, FIRST_LOOKBACK_DAYS);
    } else {
      const longer = within(MAX_LOOKBACK_DAYS);
      periodStart =
        longer.length >= BASELINE_TARGET_GAMES
          ? iso(longer[longer.length - BASELINE_TARGET_GAMES]!.playedAt)
          : daysBefore(asOf, MAX_LOOKBACK_DAYS);
    }
    const games = trackGames.filter((g) => ms(g.playedAt) >= ms(periodStart));
    if (games.length === 0) return { status: "unchanged", newGames: 0, needed: MIN_REPORT_GAMES };
    return {
      status: "report",
      kind: "first",
      periodStart,
      periodEnd: asOf,
      games,
      gameIds: games.map((g) => g.id),
      comparison: null,
      weeks,
    };
  }

  const periodStart = iso(previous.periodEnd);
  const since = ms(daysBefore(periodStart, FETCH_OVERLAP_DAYS));
  const seen = new Set(history.flatMap((r) => r.gameIds));
  const games = trackGames.filter((g) => ms(g.playedAt) >= since && !seen.has(g.id));
  const newGames = ms(asOf) === ms(periodStart) ? 0 : games.length;
  if (newGames === 0) return { status: "unchanged", latest: previous, newGames: 0, needed: MIN_REPORT_GAMES };
  if (newGames < MIN_REPORT_GAMES && !input.force) {
    return { status: "waiting", latest: previous, newGames, needed: MIN_REPORT_GAMES - newGames };
  }
  return {
    status: "report",
    kind: "weekly",
    periodStart,
    periodEnd: asOf,
    games,
    gameIds: games.map((g) => g.id),
    comparison: { start: daysBefore(periodStart, COMPARISON_DAYS), end: periodStart },
    weeks,
    previous,
  };
}
