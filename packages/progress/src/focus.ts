import {
  isEligible,
  PATTERN_IDS,
  type AnalyzedGame,
  type FocusChoice,
  type FocusExample,
  type FocusReason,
  type PatternFinding,
  type PatternPriority,
  type PatternProgress,
  type PatternStat,
  type PatternSummary,
  type PeriodStats,
  type RatingBand,
  type RetiredFocus,
  type WeeklyReport,
} from "@blunderstruck/contracts";
import { uciToSan } from "@blunderstruck/patterns";
import {
  COOLDOWN_REPORTS,
  GRADUATE_AFTER_REPORTS,
  MAX_EXAMPLES,
  MAX_FOCUS_ITEMS,
  REPORT_WEEKS,
  ROSE_MIN_PREVIOUS_RANK,
  ROTATE_AFTER_REPORTS,
  TARGET_REDUCTION,
} from "./rules";
import { verdict } from "./verdict";

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

/** Most game ids a focus item lists. */
const MAX_EXAMPLE_GAME_IDS = 3;

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const idRank = (id: string): number => {
  const i = (PATTERN_IDS as readonly string[]).indexOf(id);
  return i < 0 ? PATTERN_IDS.length : i;
};

/**
 * A report of a period with too few games for any choice. It is final, but neutral for focus:
 * it neither counts toward a cooldown or rotation nor breaks a run, and supplies no previous rank.
 */
const isFewGames = (r: WeeklyReport): boolean => r.notes?.includes("few-games") ?? false;

/** A report is final once its games are all analysed, or the run stopped after the sample on request. */
const isFinal = (r: WeeklyReport): boolean => r.coverage.complete || r.coverage.sampleOnly;

/** A pattern's stat over a set of games, or a zero stat over the same games when it never occurred. */
function statOf(
  stats: readonly PatternStat[],
  patternId: string,
  totals: { games: number; moves: number },
): PatternStat {
  return (
    stats.find((s) => s.patternId === patternId) ?? {
      patternId,
      games: totals.games,
      moves: totals.moves,
      gamesAffected: 0,
      occurrences: 0,
      per100Moves: 0,
      avgWinPctLoss: 0,
    }
  );
}

/**
 * The track's final reports, oldest first: latest revision of each period, provisional
 * revisions dropped. With `before`, only periods ending before it.
 */
function finalHistory(history: readonly WeeklyReport[], before?: string): WeeklyReport[] {
  const endMs = before === undefined ? Number.POSITIVE_INFINITY : Date.parse(before);
  const latest = new Map<string, WeeklyReport>();
  for (const r of history) {
    if (!(Date.parse(r.periodEnd) < endMs)) continue;
    const key = new Date(Date.parse(r.periodEnd)).toISOString();
    const seen = latest.get(key);
    if (!seen || r.revision > seen.revision) latest.set(key, r);
  }
  return [...latest.values()].filter(isFinal).sort((a, b) => Date.parse(a.periodEnd) - Date.parse(b.periodEnd));
}

/** One report's measurement of a held item: its verdict and rate there. */
type Measure = { enough: boolean; atTarget: boolean };

function measure(p: { verdict: PatternProgress["verdict"]; current: PatternStat }, target: number): Measure {
  const enough = p.verdict !== "insufficient-data";
  return { enough, atTarget: enough && p.current.per100Moves <= target && p.verdict !== "worse" };
}

/**
 * The earlier measurements of an item held in `prev`, newest first: each final report of the
 * unbroken run holding it that carries its verdict in `progress` (so not the report that chose it).
 * Few-games reports are skipped.
 */
function heldMeasures(finals: readonly WeeklyReport[], patternId: string, target: number): Measure[] {
  const out: Measure[] = [];
  for (let i = finals.length - 1; i >= 0; i--) {
    const r = finals[i]!;
    if (isFewGames(r)) continue;
    if (!r.focus.some((f) => f.patternId === patternId)) break;
    const p = r.progress.find((x) => x.patternId === patternId);
    if (p) out.push(measure(p, target));
  }
  return out;
}

/**
 * Patterns that may not be chosen now: graduated or rotated in one of the last
 * `COOLDOWN_REPORTS` final reports of `history`. Provisional revisions are ignored, and only
 * the latest revision of each period counts, and few-games reports are skipped. With `before` (the period end of the report
 * being built), only periods ending before it count, as in `chooseFocus`.
 */
export function cooldownPatterns(history: readonly WeeklyReport[], before?: string): Set<string> {
  const cooling = new Set<string>();
  for (const r of finalHistory(history, before).filter((r) => !isFewGames(r)).slice(-COOLDOWN_REPORTS)) {
    for (const x of r.retired) if (x.why === "graduated" || x.why === "rotated") cooling.add(x.patternId);
  }
  return cooling;
}

/** Largest losses first, preferring separate games; findings whose game or move is missing are skipped. */
function examplesFor(
  findings: readonly PatternFinding[],
  analyses: ReadonlyMap<string, AnalyzedGame>,
): FocusExample[] {
  const built: FocusExample[] = [];
  for (const f of findings) {
    const move = analyses.get(f.gameId)?.moves.find((m) => m.ply === f.ply);
    if (!move) continue;
    built.push({
      ...f,
      fen: move.fenBefore,
      played: move.san,
      ...(move.bestUci ? { best: uciToSan(move.fenBefore, move.bestUci) } : {}),
    });
  }
  const out: FocusExample[] = [];
  const games = new Set<string>();
  for (const x of built) {
    if (out.length >= MAX_EXAMPLES) break;
    if (!games.has(x.gameId)) {
      out.push(x);
      games.add(x.gameId);
    }
  }
  for (const x of built) {
    if (out.length >= MAX_EXAMPLES) break;
    if (!out.includes(x)) out.push(x);
  }
  return out.sort((a, b) => b.winPctLoss - a.winPctLoss || cmp(a.gameId, b.gameId) || a.ply - b.ply);
}

/** Distinct game ids of a pattern's findings, largest loss first. */
function exampleGameIds(findings: readonly PatternFinding[]): string[] {
  const ids: string[] = [];
  for (const f of findings) {
    if (!ids.includes(f.gameId)) ids.push(f.gameId);
    if (ids.length >= MAX_EXAMPLE_GAME_IDS) break;
  }
  return ids;
}

/**
 * Keep, graduate, rotate or retire the previous items, then fill free slots by priority.
 *
 * Only final reports of earlier periods count (`coverage.complete` or `coverage.sampleOnly`);
 * provisional revisions are ignored. For each item of the latest final report, in its order:
 * outgrown when the band no longer allows it; graduated when this report and the previous
 * report with enough data for it (verdict not "insufficient-data") both have its rate at or
 * below `target` and a verdict other than "worse"; rotated when it has been measured with
 * enough data in at least `ROTATE_AFTER_REPORTS` reports (this one included) and an eligible
 * pattern not held has a higher score; kept otherwise. Graduated and rotated patterns are not
 * chosen for the next `COOLDOWN_REPORTS` final reports (`cooldownPatterns`). Free slots are
 * filled in rank order from eligible patterns, never with one retired in this same report.
 * "rose" needs an earlier final report: on a track's first report every item is "new". The result does not depend on the order of the inputs.
 */
export function chooseFocus(input: FocusInput): FocusDecision {
  const { current, comparison, band, periodEnd, analyses } = input;
  const finals = finalHistory(input.history, periodEnd);
  const prev = finals[finals.length - 1];
  /** The last final report in which a choice could be made: the source of previous ranks. */
  const ranksFrom = finals.filter((r) => !isFewGames(r)).at(-1);

  const currentStat = (id: string) => statOf(current.stats, id, current);
  const comparisonStat = (id: string) =>
    comparison ? statOf(comparison.stats, id, comparison) : statOf([], id, { games: 0, moves: 0 });

  const ranked = [...input.priorities].sort(
    (a, b) =>
      (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY) || idRank(a.patternId) - idRank(b.patternId),
  );
  const priorityOf = (id: string) => ranked.find((p) => p.patternId === id);

  // Applied here too, so a caller that did not pass it to `priorities()` gets the same result.
  const cooling = cooldownPatterns(input.history, periodEnd);
  const everRetired = new Set(finals.flatMap((r) => r.retired.map((x) => x.patternId)));
  const held = new Set((prev?.focus ?? []).map((f) => f.patternId));
  // Only ranked patterns: an eligible pattern whose moves a higher pick covers comes back unranked.
  const choosable = (p: PatternPriority) => p.eligible && p.rank !== null && !cooling.has(p.patternId);

  const sortedFindings = [...current.findings].sort(
    (a, b) => b.winPctLoss - a.winPctLoss || cmp(a.gameId, b.gameId) || a.ply - b.ply,
  );
  const findingsOf = (id: string) => sortedFindings.filter((f) => f.patternId === id);

  const reasonFor = (id: string, kind: FocusReason["kind"]): FocusReason => {
    const p = priorityOf(id);
    const previousRank = ranksFrom?.priorities.find((x) => x.patternId === id)?.rank ?? null;
    return {
      kind,
      previousRank,
      score: p?.score ?? 0,
      recentCost: p?.recentCost ?? 0,
      naiveCostThisPeriod: p?.naiveCostThisPeriod ?? 0,
      rate: p?.rate ?? 0,
      severity: p?.severity ?? 0,
      chronicity: p?.chronicity ?? 0,
      weeksRecurred: p?.persistence.weeksRecurred ?? 0,
      weeksCounted: p?.persistence.weeksCounted ?? 0,
      weeks: p ? [...p.persistence.weeks] : Array<null>(REPORT_WEEKS).fill(null),
    };
  };

  const choice = (
    id: string,
    kind: FocusReason["kind"],
    since: string,
    baseline: PatternStat,
    target: number,
  ): FocusChoice => {
    const xs = findingsOf(id);
    return {
      patternId: id,
      exampleGameIds: exampleGameIds(xs),
      baseline,
      target,
      since,
      reason: reasonFor(id, kind),
      examples: examplesFor(xs, analyses),
    };
  };

  const focus: FocusChoice[] = [];
  const retired: RetiredFocus[] = [];
  const progress: PatternProgress[] = [];
  const retiredNow = new Set<string>();

  for (const item of prev?.focus ?? []) {
    const id = item.patternId;
    const cur = currentStat(id);
    const before = comparisonStat(id);
    const v = verdict(before, cur);
    progress.push({ patternId: id, previous: before, current: cur, verdict: v.verdict, pValue: v.pValue });

    const retire = (why: RetiredFocus["why"]) => {
      retired.push({ patternId: id, why, since: item.since, baseline: item.baseline, current: cur });
      retiredNow.add(id);
    };

    if (!isEligible(band, id)) {
      retire("outgrown");
      continue;
    }

    const now = measure({ verdict: v.verdict, current: cur }, item.target);
    const earlier = heldMeasures(finals, id, item.target).filter((m) => m.enough);
    const run = [now, ...earlier].filter((m) => m.enough);
    if (now.enough && run.length >= GRADUATE_AFTER_REPORTS && run.slice(0, GRADUATE_AFTER_REPORTS).every((m) => m.atTarget)) {
      retire("graduated");
      continue;
    }

    const own = priorityOf(id)?.score ?? Number.NEGATIVE_INFINITY;
    const challenger = ranked.some((p) => choosable(p) && !held.has(p.patternId) && p.score > own);
    if (run.length >= ROTATE_AFTER_REPORTS && challenger) {
      retire("rotated");
      continue;
    }

    focus.push(choice(id, "kept", item.since, item.baseline, item.target));
  }

  for (const p of ranked) {
    if (focus.length >= MAX_FOCUS_ITEMS) break;
    const id = p.patternId;
    if (!choosable(p) || retiredNow.has(id) || focus.some((f) => f.patternId === id)) continue;
    const previousRank = ranksFrom?.priorities.find((x) => x.patternId === id)?.rank ?? null;
    const rose = ranksFrom !== undefined && (previousRank === null || previousRank >= ROSE_MIN_PREVIOUS_RANK);
    const kind: FocusReason["kind"] = everRetired.has(id) ? "returned" : rose ? "rose" : "new";
    const baseline = currentStat(id);
    focus.push(choice(id, kind, periodEnd, baseline, baseline.per100Moves * (1 - TARGET_REDUCTION)));
  }

  return { focus, retired, progress };
}
