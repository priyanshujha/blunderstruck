import type { Evaluator } from "@blunderstruck/engine";
import type { CoachProvider } from "@blunderstruck/coach";
import type { fetchGames } from "@blunderstruck/ingest";
import {
  ANALYSIS_VERSION,
  PATTERNS_VERSION,
  settingsKey,
  type Platform,
  type RatingBand,
  type ReportTimeClass,
  type Track,
  type WeeklyReport,
} from "@blunderstruck/contracts";
import { writeReport } from "@blunderstruck/coach";
import { FETCH_MAX, MIN_REPORT_GAMES, SAMPLE_GAMES, selectGames } from "@blunderstruck/progress";
import type { Store } from "@blunderstruck/store";
import { analyseGames, currentSettings, engineNameWithoutStarting, lazyEngine } from "./analyse";
import { buildDraft, pendingFor, reportGames, storeWeekRows } from "./assemble";
import { completeReport } from "./complete";
import {
  byPlayedAtThenId,
  checkAsOf,
  chooseTrack,
  fetchSince,
  iso,
  pickTimeClass,
  planPeriod,
  ReportInputError,
  reportableGames,
} from "./periods";

export interface ReportDeps {
  store: Store;
  fetchGames: typeof fetchGames;
  startEngine: () => Promise<{ evaluator: Evaluator; name: string; quit(): Promise<void> }>;
  provider?: CoachProvider;
  now: () => Date;
  onProgress?: (e: {
    phase: "sample" | "full";
    done: number;
    total: number;
    etaSeconds: number | null;
  }) => void;
  signal?: AbortSignal;
  /** Called when a report has been stored: the first pass, and each later revision. */
  onReport?: (report: WeeklyReport, info: { pending: number }) => void;
  /** Why the report fell back to template wording, when a model call failed. */
  onWarning?: (message: string) => void;
}

export interface ReportOptions {
  platform: Platform;
  username: string;
  timeClass?: ReportTimeClass;
  depth: number;
  band?: RatingBand;
  asOf?: string;
  force: boolean;
  sampleOnly: boolean;
  maxGames?: number;
}

export interface ReportOutcome {
  status: "new" | "unchanged" | "waiting" | "resumed";
  report?: WeeklyReport;
  newGames: number;
  /** How many more games a new report needs. */
  needed: number;
  /** Games still waiting for analysis. */
  pending: number;
}

/** Run the weekly loop for one player: resume anything unfinished, then fetch, analyse, judge and word. */
export async function runReport(deps: ReportDeps, opts: ReportOptions): Promise<ReportOutcome> {
  const { store } = deps;
  if (opts.asOf !== undefined && Number.isNaN(Date.parse(opts.asOf))) throw new ReportInputError(`not a date: ${opts.asOf}`);
  const asOf = iso(opts.asOf ?? deps.now());
  if (opts.maxGames !== undefined && !(Number.isInteger(opts.maxGames) && opts.maxGames >= 1)) {
    throw new ReportInputError(`--max-games must be a whole number of at least 1, got ${opts.maxGames}`);
  }
  const engine = lazyEngine(deps.startEngine);
  // Later steps reuse this run's engine instead of starting another; it is quit once, below.
  const shared: ReportDeps = { ...deps, startEngine: () => engine.shared() };

  try {
    const stored = await store.tracks();
    const withEnds = await Promise.all(
      stored.map(async (t) => {
        const track: Track = { platform: t.platform, username: t.username, timeClass: t.timeClass };
        return { track, latestEnd: (await store.latestReport(track))?.periodEnd };
      }),
    );
    const chosen = chooseTrack({ platform: opts.platform, username: opts.username, timeClass: opts.timeClass, tracks: withEnds });

    let resumed: WeeklyReport | undefined;
    let reports: WeeklyReport[] = [];
    if (chosen && !chosen.isNew) {
      checkAsOf(await store.reports(chosen.track), asOf);
      if (!opts.sampleOnly) resumed = await completeReport(shared, chosen.track);
      reports = await store.reports(chosen.track);
    }

    const fetched = await deps.fetchGames(opts.platform, opts.username, {
      since: new Date(fetchSince(reports, asOf)),
      max: FETCH_MAX,
    });
    const mine = reportableGames(fetched, opts.username, asOf);

    let track = chosen?.track;
    if (!track) {
      const timeClass = pickTimeClass(mine, opts.username, asOf);
      if (!timeClass) return { status: "waiting", newGames: 0, needed: MIN_REPORT_GAMES, pending: 0 };
      track = { platform: opts.platform, username: opts.username, timeClass };
    }

    const plan = planPeriod({ track, reports, games: mine, asOf, force: opts.force });
    const isNew = !chosen || chosen.isNew;
    if (plan.status !== "report") {
      if (!isNew) await store.putGames(mine);
      const latest = resumed ?? plan.latest;
      return {
        status: resumed ? "resumed" : plan.status,
        ...(latest ? { report: latest } : {}),
        newGames: plan.newGames,
        needed: plan.status === "waiting" ? plan.needed : 0,
        pending: await pendingCount(store, latest),
      };
    }

    // The track first, then its games: nothing else is written before them.
    await store.putTrack(track, iso(deps.now()));
    await store.putGames(mine);

    const total = Math.min(opts.maxGames ?? plan.games.length, plan.games.length);
    const base = {
      store,
      track,
      kind: plan.kind,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      periodIds: plan.gameIds,
      total,
    };
    const previous = plan.previous;
    const changedFrom = (name: string | undefined): boolean => {
      if (!previous) return false;
      const p = previous.settings;
      if (name === undefined) {
        return p.analysisVersion !== ANALYSIS_VERSION || p.patternsVersion !== PATTERNS_VERSION || p.engine.depth !== opts.depth;
      }
      return settingsKey(p) !== settingsKey(currentSettings(opts.depth, name));
    };
    const planPass1 = async (name: string | undefined) => {
      const games = await reportGames({ ...base, key: { analysisVersion: ANALYSIS_VERSION, depth: opts.depth, engineName: name } });
      const pending = new Set(games.pending.map((g) => g.id));
      const settingsChanged = changedFrom(name);
      const todo = new Map(games.sample.filter((g) => pending.has(g.id)).map((g) => [g.id, g]));
      // With no comparable earlier analyses, the window outside the period is sampled too.
      if (!previous || settingsChanged) {
        const outside = [...games.comparison, ...games.weeksOutside].filter((g) => pending.has(g.id));
        for (const g of selectGames(outside, SAMPLE_GAMES, plan.periodStart)) todo.set(g.id, g);
      }
      return { games, settingsChanged, todo: [...todo.values()].sort(byPlayedAtThenId) };
    };

    // Plan without the engine first, so a run with everything analysed never starts it.
    let pass = await planPass1(undefined);
    let engineName: string | undefined;
    if (pass.todo.length === 0) {
      const pendingIds = new Set(pass.games.pending.map((g) => g.id));
      const done = [...pass.games.capped, ...pass.games.comparison, ...pass.games.weeksOutside]
        .map((g) => g.id)
        .filter((id) => !pendingIds.has(id));
      engineName = (await engineNameWithoutStarting(store, done, opts.depth)).name;
      if (engineName !== undefined) pass = await planPass1(engineName);
    }
    if (engineName === undefined || pass.todo.length > 0) {
      const e = await engine.get();
      engineName = e.name;
      pass = await planPass1(engineName);
      await analyseGames({
        store,
        engine: e,
        games: pass.todo,
        depth: opts.depth,
        now: deps.now,
        signal: deps.signal,
        onEach: (done, all, secondsPerGame) =>
          deps.onProgress?.({ phase: "sample", done, total: all, etaSeconds: secondsPerGame * (all - done) }),
      });
    }

    const settings = currentSettings(opts.depth, engineName);
    const { draft, pending } = await buildDraft({
      ...base,
      revision: 0,
      settings,
      ...(opts.band ? { band: opts.band } : {}),
      history: reports,
      sampleOnly: opts.sampleOnly,
      notes: pass.settingsChanged ? ["settings-changed"] : [],
    });
    const report = await writeReport(draft, deps.provider, undefined, { onModelError: deps.onWarning });
    await store.putReport(report);
    await storeWeekRows(store, report);
    deps.onReport?.(report, { pending: pending.length });

    let final = report;
    if (!opts.sampleOnly && pending.length > 0) final = (await completeReport(shared, track)) ?? report;
    return {
      status: "new",
      report: final,
      newGames: plan.games.length,
      needed: 0,
      pending: final === report ? pending.length : await pendingCount(store, final),
    };
  } finally {
    await engine.quit();
  }
}

async function pendingCount(store: Store, report: WeeklyReport | undefined): Promise<number> {
  if (!report || report.coverage.complete) return 0;
  return (await pendingFor(store, report)).length;
}
