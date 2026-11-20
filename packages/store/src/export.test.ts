import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportStore, importStore } from "./export";
import {
  TRACK,
  fixtureAnalysis,
  fixtureCheckedAnalysis,
  fixtureGame,
  fixturePeriodStats,
  fixtureReport,
} from "./conformance";
import { memoryStore } from "./memory";
import { openSqliteStore } from "./sqlite";
import type { Store } from "./store";

async function* from(lines: readonly string[]): AsyncIterable<string> {
  for (const l of lines) yield l;
}

async function dump(store: Store): Promise<string[]> {
  const out: string[] = [];
  await exportStore(store, async (line) => {
    out.push(line);
  });
  return out;
}

async function filled(store: Store): Promise<Store> {
  await store.putTrack({ ...TRACK, timeClass: "rapid" }, "2026-11-02T00:00:00.000Z");
  await store.putTrack(TRACK, "2026-11-01T00:00:00.000Z");
  await store.putGames([fixtureGame(2), fixtureGame(1), fixtureGame(3)]);
  await store.putAnalysis(fixtureAnalysis("lichess:g0002"));
  await store.putAnalysis(fixtureAnalysis("lichess:g0001"));
  await store.putAnalysis(fixtureCheckedAnalysis("lichess:g0001", 18));
  await store.putReport(fixtureReport("2026-11-19T00:00:00.000Z", 1));
  await store.putReport(fixtureReport("2026-11-12T00:00:00.000Z"));
  await store.putPeriodStats(
    "lichess:testplayer:blitz",
    "a2.p1.d12.stockfish",
    fixturePeriodStats("2026-11-12T00:00:00.000Z", "2026-11-19T00:00:00.000Z"),
  );
  return store;
}

describe("export and import", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T08:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes a header, then tracks, games, analyses and reports in a fixed order", async () => {
    const lines = (await dump(await filled(memoryStore()))).map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({
      type: "header",
      format: "blunderstruck-export",
      schemaVersion: 2,
      exportedAt: "2026-11-19T08:00:00.000Z",
    });
    expect(lines.slice(1).map((l) => l.type)).toEqual([
      "track",
      "track",
      "game",
      "game",
      "game",
      "analysis",
      "analysis",
      "analysis",
      "report",
      "report",
    ]);
    expect(lines[1].data.timeClass).toBe("blitz");
    expect(lines.slice(3, 6).map((l) => l.data.id)).toEqual(["lichess:g0001", "lichess:g0002", "lichess:g0003"]);
    expect(lines.slice(6, 9).map((l) => [l.data.gameId, l.data.check?.depth ?? 0])).toEqual([
      ["lichess:g0001", 0],
      ["lichess:g0001", 18],
      ["lichess:g0002", 0],
    ]);
    expect(lines.slice(9).map((l) => l.data.periodEnd)).toEqual([
      "2026-11-12T00:00:00.000Z",
      "2026-11-19T00:00:00.000Z",
    ]);
  });

  it("round-trips byte for byte, and importing twice changes nothing", async () => {
    const source = await filled(await openSqliteStore(":memory:"));
    const first = await dump(source);
    await source.close();

    const target = await openSqliteStore(":memory:");
    expect(await importStore(target, from(first))).toEqual({ imported: first.length - 1 });
    const second = await dump(target);
    expect(second.join("\n")).toBe(first.join("\n"));

    await importStore(target, from(first));
    expect((await dump(target)).join("\n")).toBe(first.join("\n"));
    await target.close();

    const mem = memoryStore();
    await importStore(mem, from([...first, ""]));
    expect((await dump(mem)).join("\n")).toBe(first.join("\n"));
  });

  it("round-trips a schema 2 export through a fresh store with checked analyses kept apart", async () => {
    const first = await dump(await filled(memoryStore()));
    expect(JSON.parse(first[0] ?? "").schemaVersion).toBe(2);
    for (const make of [memoryStore, () => openSqliteStore(":memory:")]) {
      const target = await make();
      await importStore(target, from(first));
      expect((await dump(target)).join("\n")).toBe(first.join("\n"));
      const key = { analysisVersion: 2, depth: 12 };
      const plain = await target.getAnalyses(["lichess:g0001"], { ...key, checkDepth: 0 });
      const checked = await target.getAnalyses(["lichess:g0001"], { ...key, checkDepth: 18 });
      expect(plain.get("lichess:g0001")).toEqual(fixtureAnalysis("lichess:g0001"));
      expect(checked.get("lichess:g0001")).toEqual(fixtureCheckedAnalysis("lichess:g0001", 18));
      await target.close();
    }
  });

  it("imports a schema 1 export, storing its analyses at check depth 0", async () => {
    const v1 = [
      { type: "header", format: "blunderstruck-export", schemaVersion: 1, exportedAt: "2026-11-01T00:00:00.000Z" },
      { type: "track", data: { ...TRACK, createdAt: "2026-11-01T00:00:00.000Z" } },
      { type: "game", data: fixtureGame(1) },
      { type: "game", data: fixtureGame(2) },
      { type: "analysis", data: fixtureAnalysis("lichess:g0001") },
      { type: "analysis", data: fixtureAnalysis("lichess:g0002") },
      { type: "report", data: fixtureReport("2026-11-19T00:00:00.000Z", 1) },
    ].map((l) => JSON.stringify(l));
    for (const make of [memoryStore, () => openSqliteStore(":memory:")]) {
      const target = await make();
      expect(await importStore(target, from(v1))).toEqual({ imported: 6 });
      const ids = ["lichess:g0001", "lichess:g0002"];
      const key = { analysisVersion: 2, depth: 12 };
      expect([...(await target.analysedIds(ids, { ...key, checkDepth: 0 }))]).toEqual(ids);
      expect((await target.analysedIds(ids, { ...key, checkDepth: 18 })).size).toBe(0);
      expect((await target.latestReport(TRACK))?.revision).toBe(1);
      const again = await dump(target);
      expect(JSON.parse(again[0] ?? "")).toEqual({
        type: "header",
        format: "blunderstruck-export",
        schemaVersion: 2,
        exportedAt: "2026-11-19T08:00:00.000Z",
      });
      expect(again.slice(1)).toEqual(v1.slice(1));
      await target.close();
    }
  });

  it("writes a track line for a report whose track was never stored", async () => {
    const source = memoryStore();
    const orphan = { platform: "chesscom" as const, username: "OtherPlayer", timeClass: "rapid" as const };
    await source.putReport(fixtureReport("2026-11-19T00:00:00Z", 0, orphan));
    await source.putReport(fixtureReport("2026-11-12T00:00:00.000Z", 0, orphan));
    const lines = await dump(source);
    expect(JSON.parse(lines[1] ?? "")).toEqual({
      type: "track",
      data: { ...orphan, createdAt: "2026-11-12T00:00:00.000Z" },
    });
    expect(lines.slice(2).map((l) => JSON.parse(l).type)).toEqual(["report", "report"]);

    const target = await openSqliteStore(":memory:");
    await importStore(target, from(lines));
    expect(await target.tracks()).toEqual([{ ...orphan, createdAt: "2026-11-12T00:00:00.000Z" }]);
    expect(await target.reports(orphan)).toHaveLength(2);
    expect((await dump(target)).join("\n")).toBe(lines.join("\n"));
    await target.close();
  });

  it("keeps the higher report revision on import", async () => {
    const target = memoryStore();
    await target.putReport(fixtureReport("2026-11-19T00:00:00.000Z", 5));
    const lines = await dump(await filled(memoryStore()));
    await importStore(target, from(lines));
    expect((await target.latestReport(TRACK))?.revision).toBe(5);
  });

  it("fails on a bad line with its line number", async () => {
    const lines = await dump(await filled(memoryStore()));
    const broken = [...lines];
    broken[3] = JSON.stringify({ type: "game", data: { id: "lichess:x" } });
    await expect(importStore(memoryStore(), from(broken))).rejects.toThrow(/line 4\b/);
    broken[3] = "{not json";
    await expect(importStore(memoryStore(), from(broken))).rejects.toThrow(/line 4: not valid JSON/);
  });

  it("fails on a report line that overlaps a stored report, with its line number", async () => {
    const lines = await dump(await filled(memoryStore()));
    const overlapping = JSON.stringify({ type: "report", data: fixtureReport("2026-11-19T00:00:00.001Z") });
    const target = await openSqliteStore(":memory:");
    await expect(importStore(target, from([...lines, overlapping]))).rejects.toThrow(
      new RegExp(`line ${lines.length + 1}: .*overlaps`),
    );
    await target.close();
  });

  it("refuses an export from a newer schema, or one without a header", async () => {
    const header = JSON.stringify({
      type: "header",
      format: "blunderstruck-export",
      schemaVersion: 3,
      exportedAt: "2026-11-19T08:00:00.000Z",
    });
    await expect(importStore(memoryStore(), from([header]))).rejects.toThrow(/newer version of blunderstruck/);
    const game = JSON.stringify({ type: "game", data: fixtureGame(1) });
    await expect(importStore(memoryStore(), from([game]))).rejects.toThrow(/line 1: expected the export header/);
  });
});
