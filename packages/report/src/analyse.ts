import {
  ANALYSIS_VERSION,
  PATTERNS_VERSION,
  perspective,
  type AnalysisSettings,
  type AnalyzedGame,
  type Color,
  type GameRecord,
} from "@blunderstruck/contracts";
import { analyzeGame, checkGame, resolveChecked, type Evaluator } from "@blunderstruck/engine";
import type { AnalysisKey, Store } from "@blunderstruck/store";

/** What `ReportDeps.startEngine` gives back. */
export interface EngineHandle {
  evaluator: Evaluator;
  name: string;
  quit(): Promise<void>;
}

/** Depth of the deeper check of flagged moves when none is asked for. 0 turns the check off. */
export const DEFAULT_CHECK_DEPTH = 18;

/**
 * The analysis settings of this code at first-look `depth` with the named engine, and the
 * deeper check at `checkDepth` (0, the default, for none). Without a check the settings carry
 * no `checkDepth`, so they and their `settingsKey` are those of an unchecked report.
 */
export function currentSettings(depth: number, engineName: string, checkDepth = 0): AnalysisSettings {
  return {
    analysisVersion: ANALYSIS_VERSION,
    patternsVersion: PATTERNS_VERSION,
    engine: { name: engineName, depth },
    ...(checkDepth > 0 ? { checkDepth } : {}),
  };
}

/** The check depth of settings: `checkDepth`, or 0 when absent. */
export const checkDepthOfSettings = (s: Pick<AnalysisSettings, "checkDepth">): number => s.checkDepth ?? 0;

/** The store key for analyses made at these settings (checked at their check depth, if any). */
export function analysisKey(s: AnalysisSettings): AnalysisKey {
  return {
    analysisVersion: s.analysisVersion,
    depth: s.engine.depth,
    checkDepth: checkDepthOfSettings(s),
    engineName: s.engine.name,
  };
}

/** True when `a` was checked at `key.checkDepth` for `color`, or `key` asks for no check. */
function doneFor(a: AnalyzedGame, key: AnalysisKey, color: Color): boolean {
  return key.checkDepth === 0 || (a.check?.depth === key.checkDepth && a.check.colors.includes(color));
}

/**
 * First looks of `ids` at `key`'s version, depth and engine: the unchecked analysis, else one
 * stored under `key.checkDepth` (a check keeps every first-look field as it was, so its stored
 * analysis is the same first look). Never resolved: the values are those of the first look.
 */
export async function firstLookAnalyses(
  store: Store,
  ids: readonly string[],
  key: AnalysisKey,
): Promise<Map<string, AnalyzedGame>> {
  const found = await store.getAnalyses(ids, { ...key, checkDepth: 0 });
  if (key.checkDepth > 0) {
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) for (const [id, a] of await store.getAnalyses(missing, key)) found.set(id, a);
  }
  return found;
}

/**
 * The analyses of `games` that count at `key`, as the report reads them. Without a check, the
 * stored analyses. With one, only games checked at `key.checkDepth` for the player's colour,
 * each through `resolveChecked`. With `firstLook`, the first looks (`firstLookAnalyses`).
 */
export async function reportAnalyses(
  store: Store,
  username: string,
  games: readonly GameRecord[],
  key: AnalysisKey,
  firstLook = false,
): Promise<Map<string, AnalyzedGame>> {
  const ids = games.map((g) => g.id);
  if (key.checkDepth === 0) return store.getAnalyses(ids, key);
  if (firstLook) return firstLookAnalyses(store, ids, key);
  const stored = await store.getAnalyses(ids, key);
  const out = new Map<string, AnalyzedGame>();
  for (const g of games) {
    const a = stored.get(g.id);
    const color = perspective(g, username)?.color;
    if (a && color && doneFor(a, key, color)) out.set(g.id, resolveChecked(a));
  }
  return out;
}

/**
 * Ids among `games` that are done at `key`: analysed (and, with a check, checked for the
 * player's colour). With `firstLook`, those that have a first look at all.
 */
export async function doneIds(
  store: Store,
  username: string,
  games: readonly GameRecord[],
  key: AnalysisKey,
  firstLook = false,
): Promise<Set<string>> {
  const ids = games.map((g) => g.id);
  if (key.checkDepth === 0) return store.analysedIds(ids, key);
  if (firstLook) {
    const found = await store.analysedIds(ids, { ...key, checkDepth: 0 });
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) for (const id of await store.analysedIds(missing, key)) found.add(id);
    return found;
  }
  return new Set((await reportAnalyses(store, username, games, key)).keys());
}

/**
 * Starts the engine on first use only, and quits it once. `shared()` hands out the same
 * engine with a no-op `quit`, for a step that would otherwise start its own.
 */
export function lazyEngine(start: () => Promise<EngineHandle>) {
  let running: Promise<EngineHandle> | undefined;
  return {
    get started(): boolean {
      return running !== undefined;
    },
    get(): Promise<EngineHandle> {
      running ??= start();
      return running;
    },
    async shared(): Promise<EngineHandle> {
      const e = await this.get();
      return { evaluator: e.evaluator, name: e.name, quit: async () => {} };
    },
    async quit(): Promise<void> {
      if (!running) return;
      const r = running;
      running = undefined;
      let engine: EngineHandle;
      try {
        engine = await r;
      } catch {
        return;
      }
      await engine.quit();
    },
  };
}

/**
 * The engine name to use without starting the engine, following the CLI's cache rule: only
 * when nothing is missing and every reusable first look comes from one engine build.
 */
export async function engineNameWithoutStarting(
  store: Store,
  ids: readonly string[],
  depth: number,
  checkDepth = 0,
): Promise<{ name?: string; missing: number }> {
  const key: AnalysisKey = { analysisVersion: ANALYSIS_VERSION, depth, checkDepth };
  const found = await firstLookAnalyses(store, ids, key);
  const missing = ids.filter((id) => !found.has(id)).length;
  const names = new Set([...found.values()].map((a) => a.engine.name));
  return names.size === 1 && missing === 0 ? { name: [...names][0]!, missing } : { missing };
}

/** Thrown between games (or between a game's first look and its check) when the run's signal is aborted. */
export class AnalysisAborted extends Error {
  constructor(
    readonly done: number,
    readonly total: number,
    readonly what: "analysed" | "checked" = "analysed",
  ) {
    super(`Stopped: ${done} of ${total} ${what}`);
    this.name = "AnalysisAborted";
  }
}

/**
 * Analyse `games` one at a time in the given order and save each one as soon as it is done.
 * Checks `signal` between games (throwing `AnalysisAborted`). `onEach` gets the count done
 * and the mean seconds per game so far, timed with `now` (never the system clock directly).
 * These are first looks: nothing is checked, and each is stored under check depth 0.
 */
export async function analyseGames(input: {
  store: Store;
  engine: EngineHandle;
  games: readonly GameRecord[];
  depth: number;
  now: () => Date;
  signal?: AbortSignal;
  onEach?: (done: number, total: number, secondsPerGame: number) => void;
}): Promise<number> {
  const { store, engine, games, depth, now, signal } = input;
  const startedAt = now().getTime();
  let done = 0;
  for (const g of games) {
    if (signal?.aborted) throw new AnalysisAborted(done, games.length);
    const a = await analyzeGame(engine.evaluator, g, { depth });
    await store.putAnalysis({ ...a, engine: { name: engine.name, depth } });
    done++;
    input.onEach?.(done, games.length, (now().getTime() - startedAt) / 1000 / done);
  }
  return done;
}

/**
 * Bring `games` to the check at `checkDepth` for `username`'s colour, one at a time in the
 * given order, saving each result as soon as it is done:
 * - a game already checked at that depth for the player's colour is left as it is;
 * - a game with a first look at `depth` (unchecked, or checked for the other colour) is only
 *   checked;
 * - any other game is analysed first (stored as a first look under check depth 0), then checked.
 * The checked game is stored under `checkDepth`. `signal` is read between games and between a
 * game's first look and its check, so a stop loses at most the game in progress (an abort
 * throws `AnalysisAborted` counting games "checked"). `onEach` is as in `analyseGames`.
 */
export async function checkGames(input: {
  store: Store;
  engine: EngineHandle;
  username: string;
  games: readonly GameRecord[];
  depth: number;
  checkDepth: number;
  now: () => Date;
  signal?: AbortSignal;
  onEach?: (done: number, total: number, secondsPerGame: number) => void;
}): Promise<number> {
  const { store, engine, games, depth, checkDepth, now, signal } = input;
  const key: AnalysisKey = { analysisVersion: ANALYSIS_VERSION, depth, checkDepth, engineName: engine.name };
  const ids = games.map((g) => g.id);
  const checked = await store.getAnalyses(ids, key);
  const unchecked = await store.getAnalyses(ids, { ...key, checkDepth: 0 });
  const startedAt = now().getTime();
  let done = 0;
  for (const g of games) {
    if (signal?.aborted) throw new AnalysisAborted(done, games.length, "checked");
    const color = perspective(g, input.username)?.color;
    const prior = checked.get(g.id);
    if (color && !(prior && doneFor(prior, key, color))) {
      let base = prior ?? unchecked.get(g.id);
      if (!base) {
        const a = await analyzeGame(engine.evaluator, g, { depth });
        base = { ...a, engine: { name: engine.name, depth } };
        await store.putAnalysis(base);
        if (signal?.aborted) throw new AnalysisAborted(done, games.length, "checked");
      }
      await store.putAnalysis(await checkGame(engine.evaluator, base, { depth: checkDepth, color }));
    }
    done++;
    input.onEach?.(done, games.length, (now().getTime() - startedAt) / 1000 / done);
  }
  return done;
}
