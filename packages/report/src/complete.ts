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
import { AnalysisAborted, analyseGames, analysisKey, currentSettings, type EngineHandle } from "./analyse";
import { buildDraft, reportGames, storeWeekRows } from "./assemble";
import { iso, latestRevisions } from "./periods";
import type { ReportDeps } from "./run";

export interface CompleteOptions {
  /** The depth this run analyses at; defaults to the stored report's. */
  depth?: number;
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
  opts: { depth?: number; includeSampleOnly: boolean },
): Promise<WeeklyReport | undefined> {
  const unfinished = latestRevisions(await deps.store.reports(track)).filter(
    (r) => !r.coverage.complete && (opts.includeSampleOnly || !r.coverage.sampleOnly),
  );
  let last: WeeklyReport | undefined;
  for (const r of unfinished) {
    const done = await completeReport(deps, track, {
      ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
      periodEnd: r.periodEnd,
    });
    if (done) last = done;
  }
  return last;
}

/**
 * Finish one report of the track (`opts.periodEnd`, else the latest) when it is not complete
 * (provisional, or stopped after the sample on request): analyse every game it still needs,
 * one at a time in `(playedAt, id)` order, then store the next revision with
 * `coverage.complete = true`, its weekly rows, and call `onReport`. Returns undefined when that
 * report is complete or missing, or when another run stored the period first (then nothing
 * else is written).
 *
 * Rules:
 * - A sample-only report keeps `sampleOnly: true` in the store until the completed revision
 *   replaces it; stopping part way leaves it as it was (the analyses made are kept).
 * - When this run's settings (analysis or patterns version, depth, engine) differ from the
 *   report's, the period is rebuilt at the new settings: every game it needs is analysed at
 *   them and the new revision notes "settings-changed".
 * - The engine is started only when something must be analysed.
 * - Progress is `phase: "full"`, counting this pass's games; `etaSeconds` is null until one
 *   game has been timed. An abort between games throws `AnalysisAborted` with this pass's
 *   counts, as in the first pass; the engine is left to the caller (inside a run its `quit`
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
    });

  let settings = report.settings;
  let games = await scope(settings);
  const versionsChanged =
    settings.analysisVersion !== ANALYSIS_VERSION ||
    settings.patternsVersion !== PATTERNS_VERSION ||
    settings.engine.depth !== depth;
  let settingsChanged = false;

  if (versionsChanged || games.pending.length > 0) {
    if (deps.signal?.aborted) throw new AnalysisAborted(0, games.pending.length);
    const engine: EngineHandle = await deps.startEngine();
    try {
      const next = currentSettings(depth, engine.name);
      if (settingsKey(next) !== settingsKey(settings)) {
        settings = next;
        settingsChanged = true;
        games = await scope(settings);
      }
      const todo = games.pending;
      deps.onProgress?.({ phase: "full", done: 0, total: todo.length, etaSeconds: null });
      await analyseGames({
        store,
        engine,
        games: todo,
        depth,
        now: deps.now,
        signal: deps.signal,
        onEach: (done, all, secondsPerGame) =>
          deps.onProgress?.({ phase: "full", done, total: all, etaSeconds: secondsPerGame * (all - done) }),
      });
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
