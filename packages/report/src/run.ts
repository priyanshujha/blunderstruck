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
import {
  analyseGames,
  analysisKey,
  checkDepthOfSettings,
  checkGames,
  currentSettings,
  DEFAULT_CHECK_DEPTH,
  doneIds,
  engineNameWithoutStarting,
  lazyEngine,
} from "./analyse";
import { buildDraft, carryWording, pendingFor, reportGames, storeWeekRows } from "./assemble";
import { completeReport, completeUnfinished } from "./complete";
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
    /**
     * "sample": the first look at the sample. "check": checking flagged moves more deeply, every
     * game already having its first look. "full": analysing the remaining games (and checking
     * them, when the check is on).
     */
    phase: "sample" | "check" | "full";
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
  /** First-look depth. */
  depth: number;
  /** Depth of the deeper check of flagged moves; 0 turns it off. Default `DEFAULT_CHECK_DEPTH`. */
  checkDepth?: number;
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
  /** Games still waiting for analysis or for their check. */
  pending: number;
  /** The player's other tracks on this platform, when there are any (the run used `report.track`). */
  otherTracks?: Track[];
  /** Another run stored a report for this period first; `report` is the stored latest one. */
  lostRace?: true;
}

/** Run the weekly loop for one player: resume anything unfinished, then fetch, analyse, judge and word. */
export async function runReport(deps: ReportDeps, opts: ReportOptions): Promise<ReportOutcome> {
  const { store } = deps;
  if (opts.asOf !== undefined && Number.isNaN(Date.parse(opts.asOf))) throw new ReportInputError(`not a date: ${opts.asOf}`);
  const asOf = iso(opts.asOf ?? deps.now());
  if (opts.maxGames !== undefined && !(Number.isInteger(opts.maxGames) && opts.maxGames >= 1)) {
    throw new ReportInputError(`--max-games must be a whole number of at least 1, got ${opts.maxGames}`);
  }
  const checkDepth = opts.checkDepth ?? DEFAULT_CHECK_DEPTH;
  if (!(Number.isInteger(checkDepth) && checkDepth >= 0)) {
    throw new ReportInputError(`--check-depth must be a whole number of at least 0, got ${opts.checkDepth}`);
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
      // Every unfinished report first, oldest first; --sample-only only spares sample-only ones.
      resumed = await completeUnfinished(shared, chosen.track, {
        depth: opts.depth,
        checkDepth,
        includeSampleOnly: !opts.sampleOnly,
      });
      reports = await store.reports(chosen.track);
    }

    const fetched = await deps.fetchGames(opts.platform, opts.username, {
      since: new Date(fetchSince(reports, asOf)),
      max: FETCH_MAX,
    });
    const mine = reportableGames(fetched, opts.username, asOf);
    const others = chosen && chosen.others.length > 0 ? { otherTracks: chosen.others } : {};

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
      const latest = plan.latest ?? resumed;
      return {
        status: resumed ? "resumed" : plan.status,
        ...(latest ? { report: latest } : {}),
        newGames: plan.newGames,
        needed: plan.status === "waiting" ? plan.needed : 0,
        pending: await pendingCount(store, latest),
        ...others,
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
        return (
          p.analysisVersion !== ANALYSIS_VERSION ||
          p.patternsVersion !== PATTERNS_VERSION ||
          p.engine.depth !== opts.depth ||
          checkDepthOfSettings(p) !== checkDepth
        );
      }
      return settingsKey(p) !== settingsKey(currentSettings(opts.depth, name, checkDepth));
    };
    const keyFor = (name: string | undefined) => ({ analysisVersion: ANALYSIS_VERSION, depth: opts.depth, checkDepth, engineName: name });
    // Pass 1 takes first looks only; a game with one, checked or not, needs nothing from it.
    const planPass1 = async (name: string | undefined) => {
      const games = await reportGames({ ...base, key: keyFor(name), firstLook: true });
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

    /**
     * Under --sample-only with the check on, the games pass 1 leaves at their first look: every
     * game the report needs that has one and is not yet checked for the player. They are checked
     * before the report is stored, so a final report never rests on unchecked moves.
     */
    const toCheck = async (name: string) => {
      if (!opts.sampleOnly || checkDepth === 0) return [];
      const key = keyFor(name);
      const target = await reportGames({ ...base, key });
      const looked = await doneIds(store, track!.username, target.pending, key, true);
      return target.pending.filter((g) => looked.has(g.id));
    };

    // Plan without the engine first, so a run with everything analysed (and checked) never starts it.
    let pass = await planPass1(undefined);
    let engineName: string | undefined;
    if (pass.todo.length === 0) {
      const pendingIds = new Set(pass.games.pending.map((g) => g.id));
      const done = [...pass.games.capped, ...pass.games.comparison, ...pass.games.weeksOutside]
        .map((g) => g.id)
        .filter((id) => !pendingIds.has(id));
      const known = (await engineNameWithoutStarting(store, done, opts.depth, checkDepth)).name;
      if (known !== undefined) {
        pass = await planPass1(known);
        if (pass.todo.length === 0 && (await toCheck(known)).length === 0) engineName = known;
      }
    }
    if (engineName === undefined) {
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

    const settings = currentSettings(opts.depth, engineName, checkDepth);
    const checking = await toCheck(engineName);
    if (checking.length > 0) {
      const e = await engine.get();
      deps.onProgress?.({ phase: "check", done: 0, total: checking.length, etaSeconds: null });
      await checkGames({
        store,
        engine: e,
        username: track.username,
        games: checking,
        depth: opts.depth,
        checkDepth,
        now: deps.now,
        signal: deps.signal,
        onEach: (done, all, secondsPerGame) =>
          deps.onProgress?.({ phase: "check", done, total: all, etaSeconds: secondsPerGame * (all - done) }),
      });
    }
    // The first revision reads first looks while anything still waits for its check.
    const firstLook =
      checkDepth > 0 && !opts.sampleOnly && (await reportGames({ ...base, key: analysisKey(settings) })).pending.length > 0;
    const lostRace = async (): Promise<ReportOutcome> => {
      const latest = await store.latestReport(track!);
      return {
        status: "unchanged",
        ...(latest ? { report: latest } : {}),
        newGames: plan.games.length,
        needed: 0,
        pending: await pendingCount(store, latest),
        ...others,
        lostRace: true,
      };
    };
    const built = await buildDraft({
      ...base,
      revision: 0,
      settings,
      ...(opts.band ? { band: opts.band } : {}),
      history: reports,
      sampleOnly: opts.sampleOnly,
      notes: pass.settingsChanged ? ["settings-changed"] : [],
      firstLook,
    });
    const { draft, pending, carriedFrom } = built;
    const written = await writeReport(draft, deps.provider, undefined, { onModelError: deps.onWarning });
    const report = carriedFrom ? carryWording(written, carriedFrom) : written;
    if ((await store.putReport(report)) !== "stored") return lostRace();
    await storeWeekRows(store, report);
    deps.onReport?.(report, { pending: pending.length });

    let final = report;
    if (!opts.sampleOnly && pending.length > 0) {
      const done = await completeReport(shared, track, { depth: opts.depth, checkDepth, periodEnd: report.periodEnd });
      if (!done) return lostRace();
      final = done;
    }
    return {
      status: "new",
      report: final,
      newGames: plan.games.length,
      needed: 0,
      pending: final === report ? pending.length : await pendingCount(store, final),
      ...others,
    };
  } finally {
    await engine.quit();
  }
}

async function pendingCount(store: Store, report: WeeklyReport | undefined): Promise<number> {
  if (!report || report.coverage.complete) return 0;
  return (await pendingFor(store, report)).length;
}
