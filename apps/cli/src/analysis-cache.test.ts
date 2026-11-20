import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ANALYSIS_VERSION, type AnalyzedGame } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { defaultCachePath, loadCache, mergeCache, needsEngine, parseCache, planCache, saveCache } from "./analysis-cache";

const entry = (gameId: string, depth = 12, analysisVersion = ANALYSIS_VERSION, name = "Stub 1"): AnalyzedGame => ({
  gameId,
  analysisVersion,
  engine: { name, depth },
  moves: [],
});

describe("planCache", () => {
  it("reuses only entries with the same id, version and depth", () => {
    const cache = [entry("a"), entry("b", 16), entry("c", 12, 1)];
    const plan = planCache(cache, ["a", "b", "c", "d"], { depth: 12 });
    expect([...plan.hits.keys()]).toEqual(["a"]);
    expect(plan.missing).toEqual(["b", "c", "d"]);
    expect(plan.stale).toBe(2);
  });
});

describe("engine name", () => {
  it("accepts a full cache from one engine without starting it", () => {
    const plan = planCache([entry("a"), entry("b")], ["a", "b"], { depth: 12 });
    expect(needsEngine(plan)).toBe(false);
    expect(plan.hits.size).toBe(2);
  });

  it("needs the engine when cached entries disagree, then re-analyses the ones that differ", () => {
    const cache = [entry("a"), entry("b", 12, ANALYSIS_VERSION, "Stub 2")];
    expect(needsEngine(planCache(cache, ["a", "b"], { depth: 12 }))).toBe(true);
    const plan = planCache(cache, ["a", "b"], { depth: 12, engineName: "Stub 2" });
    expect([...plan.hits.keys()]).toEqual(["b"]);
    expect(plan.missing).toEqual(["a"]);
    expect(plan.stale).toBe(1);
  });

  it("needs the engine when any game is missing", () => {
    expect(needsEngine(planCache([entry("a")], ["a", "b"], { depth: 12 }))).toBe(true);
  });
});

describe("mergeCache", () => {
  it("replaces entries for the same game and keeps other games", () => {
    const merged = mergeCache([entry("a", 12, 1), entry("z")], [entry("a")]);
    expect(merged).toHaveLength(2);
    expect(merged.find((a) => a.gameId === "a")!.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(merged.some((a) => a.gameId === "z")).toBe(true);
  });
});

describe("parseCache and files", () => {
  it("drops invalid entries and tolerates a missing or damaged file", async () => {
    expect(parseCache([entry("a"), { gameId: 3 }])).toHaveLength(1);
    expect(parseCache({})).toEqual([]);
    const dir = await mkdtemp(join(tmpdir(), "bs-cache-"));
    expect(await loadCache(join(dir, "none.json"))).toEqual([]);
    await writeFile(join(dir, "bad.json"), "{not json");
    expect(await loadCache(join(dir, "bad.json"))).toEqual([]);
    const path = join(dir, "ok.json");
    await saveCache(path, [entry("a")]);
    expect(JSON.parse(await readFile(path, "utf8"))).toHaveLength(1);
    expect(await loadCache(path)).toEqual([entry("a")]);
  });

  it("puts the cache next to the games file", () => {
    expect(defaultCachePath("data/lichess-someone.json")).toBe("data/lichess-someone.analyses.json");
  });
});
