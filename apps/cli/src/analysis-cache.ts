import { readFile, rename, writeFile } from "node:fs/promises";
import { ANALYSIS_VERSION, AnalyzedGame } from "@blunderstruck/contracts";

/**
 * Saved analyses, one per game, so `patterns` runs Stockfish only on games it has not seen.
 * An entry is reused only when its game id, analysis version, depth and engine name all match;
 * anything else is analysed again and replaced, never compared.
 */

export interface CacheKey {
  depth: number;
  /** Defaults to the current `ANALYSIS_VERSION`. */
  analysisVersion?: number;
  /**
   * The running engine's name. Leave it out to plan without starting the engine; then check
   * `needsEngine` before trusting the plan.
   */
  engineName?: string;
}

export interface CachePlan {
  /** Reusable analyses, by game id. */
  hits: Map<string, AnalyzedGame>;
  /** Game ids to analyse, in input order. */
  missing: string[];
  /** How many of `missing` had an entry from another version, depth or engine. */
  stale: number;
}

/** Entries that are not a valid `AnalyzedGame` are dropped, so a damaged or old file never stops a run. */
export function parseCache(raw: unknown): AnalyzedGame[] {
  if (!Array.isArray(raw)) return [];
  const out: AnalyzedGame[] = [];
  for (const entry of raw) {
    const r = AnalyzedGame.safeParse(entry);
    if (r.success) out.push(r.data);
  }
  return out;
}

export function planCache(cache: readonly AnalyzedGame[], gameIds: readonly string[], key: CacheKey): CachePlan {
  const version = key.analysisVersion ?? ANALYSIS_VERSION;
  const byId = new Map(cache.map((a) => [a.gameId, a]));
  const hits = new Map<string, AnalyzedGame>();
  const missing: string[] = [];
  let stale = 0;
  for (const id of gameIds) {
    const a = byId.get(id);
    if (
      a &&
      a.analysisVersion === version &&
      a.engine.depth === key.depth &&
      (key.engineName === undefined || a.engine.name === key.engineName)
    ) {
      hits.set(id, a);
    } else {
      if (a) stale++;
      missing.push(id);
    }
  }
  return { hits, missing, stale };
}

/**
 * Whether a plan made without an engine name still needs the engine: some games are missing,
 * or the reusable entries come from more than one engine build. When it is false the run can
 * skip starting Stockfish.
 */
export function needsEngine(plan: CachePlan): boolean {
  if (plan.missing.length > 0) return true;
  return new Set([...plan.hits.values()].map((a) => a.engine.name)).size > 1;
}

/** The cache with `fresh` analyses replacing any entry for the same game; other games are kept. */
export function mergeCache(cache: readonly AnalyzedGame[], fresh: readonly AnalyzedGame[]): AnalyzedGame[] {
  const byId = new Map(cache.map((a) => [a.gameId, a]));
  for (const a of fresh) byId.set(a.gameId, a);
  return [...byId.values()];
}

export function defaultCachePath(gamesFile: string): string {
  return `${gamesFile.replace(/\.json$/i, "")}.analyses.json`;
}

export async function loadCache(path: string): Promise<AnalyzedGame[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  try {
    return parseCache(JSON.parse(text));
  } catch {
    return [];
  }
}

/** Writes through a temporary file so an interrupted run never leaves half a cache. */
export async function saveCache(path: string, entries: readonly AnalyzedGame[]): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(entries));
  await rename(tmp, path);
}
