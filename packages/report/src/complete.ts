import {
  ANALYSIS_VERSION,
  PATTERNS_VERSION,
  settingsKey,
  type AnalysisSettings,
  type ReportNote,
  type Track,
  type WeeklyReport,
} from "@blunderstruck/contracts";
import { writeReport } from "@blunderstruck/coach";
import {
  AnalysisAborted,
  analyseGames,
  analysisKey,
  checkDepthOfSettings,
  checkGames,
  currentSettings,
  doneIds,
  type EngineHandle,
} from "./analyse";
import { buildDraft, reportGames, storeWeekRows } from "./assemble";
import { iso, latestRevisions } from "./periods";
import type { ReportDeps } from "./run";

export interface CompleteOptions {
  /** The first-look depth this run analyses at; defaults to the stored report's. */
  depth?: number;
  /** The depth of the deeper check this run makes (0 for none); defaults to the stored report's. */
  checkDepth?: number;
  /** Which period to complete; defaults to the track's latest. */
  periodEnd?: string;
}

/**
 * Complete every unfinished report of the track, oldest period first. Provisional reports are
 * always completed; sample-only ones only with `includeSampleOnly` (a run without
 * `--sample-only`). Returns the last report completed, or undefined when there was none.
 */
export async function completeUnfinished(
  deps: ReportDeps,
  track: Track,
  opts: { depth?: number; checkDepth?: number; includeSampleOnly: boolean },
): Promise<WeeklyReport | undefined> {
  const unfinished = latestRevisions(await deps.store.reports(track)).filter(
    (r) => !r.coverage.complete && (opts.includeSampleOnly || !r.coverage.sampleOnly),
  );
  let last: WeeklyReport | undefined;
  for (const r of unfinished) {
    const done = await completeReport(deps, track, {
      ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
      ...(opts.checkDepth !== undefined ? { checkDepth: opts.checkDepth } : {}),
      periodEnd: r.periodEnd,
    });
    if (done) last = done;
  }
  return last;
}

/**
 * Finish one report of the track (`opts.periodEnd`, else the latest) when it is not complete
 * (provisional, or stopped after the sample on request): analyse every game it still needs,
 * one at a time in `(playedAt, id)` order, and with a deeper check check each of them (a game
 * already checked at that depth for the player's colour is reused; one with a first look is only
 * checked), then store the next revision, built from the checked values, with
 * `coverage.complete = true`, its weekly rows, and call `onReport`. Returns undefined when that
 * report is complete or missing, or when another run stored the period first (then nothing
 * else is written).
 *
 * Rules:
 * - A sample-only report keeps `sampleOnly: true` in the store until the completed revision
 *   replaces it; stopping part way leaves it as it was (the analyses made are kept).
 * - When this run's settings (analysis or patterns version, depth, check depth, engine) differ
 *   from the report's, the period is rebuilt at the new settings: every game it needs is
 *   analysed (and checked) at them and the new revision notes "settings-changed". First looks
 *   at the same depth and engine are reused under a new check depth; checks at another depth
 *   never count.
 * - The engine is started only when something must be analysed.
 * - Progress is `phase: "full"` when any game of this pass needs a first look, else `"check"`
 *   (every game only needs its check), counting this pass's games; `etaSeconds` is null until
 *   one game has been timed. An abort between games (or between a game's first look and its
 *   check) throws `AnalysisAborted` with this pass's counts, as in the first pass; the engine is left to the caller (inside a run its `quit`
 *   does nothing).
 * - Wording goes through `writeReport` with the stored report as `previous`: an unchanged
 *   focus makes no call, a changed one makes at most one reword call, and the period never
 *   passes three calls in all.
 */
export async function completeReport(
  deps: ReportDeps,
  track: Track,
  opts: CompleteOptions = {},
): Promise<WeeklyReport | undefined> {
  const { store } = deps;
  const stored = latestRevisions(await store.reports(track));
  const report =
    opts.periodEnd === undefined ? stored.at(-1) : stored.find((r) => r.periodEnd === iso(opts.periodEnd!));
  if (!report || report.coverage.complete) return undefined;

  const depth = opts.depth ?? report.settings.engine.depth;
  const checkDepth = opts.checkDepth ?? checkDepthOfSettings(report.settings);
  const scope = (settings: AnalysisSettings) =>
    reportGames({
      store,
      track: report.track,
      kind: report.kind,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      periodIds: report.gameIds,
      total: report.coverage.total,
      key: analysisKey(settings),
      ...(report.cappedGameIds ? { cappedIds: report.cappedGameIds } : {}),
    });

  let settings = report.settings;
  let games = await scope(settings);
  const versionsChanged =
    settings.analysisVersion !== ANALYSIS_VERSION ||
    settings.patternsVersion !== PATTERNS_VERSION ||
    settings.engine.depth !== depth ||
    checkDepthOfSettings(settings) !== checkDepth;
  let settingsChanged = false;

  if (versionsChanged || games.pending.length > 0) {
    if (deps.signal?.aborted) throw new AnalysisAborted(0, games.pending.length);
    const engine: EngineHandle = await deps.startEngine();
    try {
      const next = currentSettings(depth, engine.name, checkDepth);
      if (settingsKey(next) !== settingsKey(settings)) {
        settings = next;
        settingsChanged = true;
        games = await scope(settings);
      }
      const todo = games.pending;
      const key = analysisKey(settings);
      const looked = checkDepth > 0 ? await doneIds(store, report.track.username, todo, key, true) : new Set<string>();
      const phase = checkDepth > 0 && todo.every((g) => looked.has(g.id)) ? "check" : "full";
      deps.onProgress?.({ phase, done: 0, total: todo.length, etaSeconds: null });
      const pass = {
        store,
        engine,
        games: todo,
        depth,
        now: deps.now,
        signal: deps.signal,
        onEach: (done: number, all: number, secondsPerGame: number) =>
          deps.onProgress?.({ phase, done, total: all, etaSeconds: secondsPerGame * (all - done) }),
      };
      if (checkDepth > 0) await checkGames({ ...pass, username: report.track.username, checkDepth });
      else await analyseGames(pass);
    } finally {
      await engine.quit();
    }
  }

  const notes: ReportNote[] = settingsChanged || report.notes.includes("settings-changed") ? ["settings-changed"] : [];
  const { draft, pending } = await buildDraft({
    store,
    track: report.track,
    kind: report.kind,
    revision: report.revision + 1,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    periodIds: report.gameIds,
    total: report.coverage.total,
    settings,
    ...(report.bandSource === "override" ? { band: report.band } : {}),
    history: await store.reports(report.track),
    sampleOnly: false,
    notes,
    ...(report.cappedGameIds ? { cappedIds: report.cappedGameIds } : {}),
  });

  const written = await writeReport(draft, deps.provider, report, { onModelError: deps.onWarning });
  // Text kept from a revision whose call failed is still template text for that reason.
  const madeCall = written.wording.calls > report.wording.calls;
  const next =
    !madeCall && report.notes.includes("model-failed") && !written.notes.includes("model-failed")
      ? { ...written, notes: [...written.notes, "model-failed" as const] }
      : written;

  if ((await store.putReport(next)) !== "stored") return undefined;
  await storeWeekRows(store, next);
  deps.onReport?.(next, { pending: pending.length });
  return next;
}
