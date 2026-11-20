import {
  ANALYSIS_VERSION,
  PATTERNS_VERSION,
  type AnalysisSettings,
  type GameRecord,
} from "@blunderstruck/contracts";
import { analyzeGame, type Evaluator } from "@blunderstruck/engine";
import type { AnalysisKey, Store } from "@blunderstruck/store";

/** What `ReportDeps.startEngine` gives back. */
export interface EngineHandle {
  evaluator: Evaluator;
  name: string;
  quit(): Promise<void>;
}

/** The analysis settings of this code at `depth` with the named engine. */
export function currentSettings(depth: number, engineName: string): AnalysisSettings {
  return { analysisVersion: ANALYSIS_VERSION, patternsVersion: PATTERNS_VERSION, engine: { name: engineName, depth } };
}

/** The store key for analyses made at these settings. */
export function analysisKey(s: AnalysisSettings): AnalysisKey {
  return { analysisVersion: s.analysisVersion, depth: s.engine.depth, engineName: s.engine.name };
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
 * when nothing is missing and every reusable analysis comes from one engine build.
 */
export async function engineNameWithoutStarting(
  store: Store,
  ids: readonly string[],
  depth: number,
): Promise<{ name?: string; missing: number }> {
  const key: AnalysisKey = { analysisVersion: ANALYSIS_VERSION, depth };
  const found = await store.getAnalyses(ids, key);
  const missing = ids.filter((id) => !found.has(id)).length;
  const names = new Set([...found.values()].map((a) => a.engine.name));
  return names.size === 1 && missing === 0 ? { name: [...names][0]!, missing } : { missing };
}

/** Thrown between games when the run's signal is aborted. */
export class AnalysisAborted extends Error {
  constructor(
    readonly done: number,
    readonly total: number,
  ) {
    super(`Stopped: ${done} of ${total} analysed`);
    this.name = "AnalysisAborted";
  }
}

/**
 * Analyse `games` one at a time in the given order and save each one as soon as it is done.
 * Checks `signal` between games (throwing `AnalysisAborted`). `onEach` gets the count done
 * and the mean seconds per game so far, timed with `now` (never the system clock directly).
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
