import { settingsKey, trackKey, WeeklyReport } from "@blunderstruck/contracts";
import { analyzeGame } from "@blunderstruck/engine";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeReport } from "./complete";
import { ReportInputError } from "./periods";
import { runReport } from "./run";
import { AS_OF, failingProvider, game, games, harness, opts, PLAYER, stubEvaluator, WEEK_LATER } from "./test-helpers";

// Pass 2 is tested on its own; here it only records that it was asked for.
vi.mock("./complete", () => ({ completeReport: vi.fn(async () => undefined) }));
const complete = vi.mocked(completeReport);

beforeEach(() => complete.mockClear());

describe("runReport: first report", () => {
  it("takes the 30 days before asOf, stores track, games, report and weekly rows, and makes one model call", async () => {
    const h = harness([...games(25, 0.5, 29), ...games(5, 31, 41)]);
    const provider = failingProvider();
    const warnings: string[] = [];
    const out = await runReport(h.deps({ provider, onWarning: (m) => warnings.push(m) }), opts());

    expect(out).toMatchObject({ status: "new", newGames: 25, needed: 0, pending: 0 });
    const r = out.report!;
    expect(() => WeeklyReport.parse(r)).not.toThrow();
    expect(r).toMatchObject({
      kind: "first",
      revision: 0,
      periodStart: "2026-10-20T12:00:00.000Z",
      periodEnd: AS_OF,
      gamesFound: 25,
      gamesAnalyzed: 25,
      comparison: null,
      trends: [],
      band: "club",
      bandSource: "ratings",
      rating: 1650,
      coverage: { sampled: 25, analysed: 25, total: 25, complete: true, sampleOnly: false },
    });
    expect(r.gameIds).toHaveLength(25);
    expect(r.weeks).toHaveLength(6);
    expect(r.weeks.reduce((s, w) => s + w.games, 0)).toBe(30);
    expect(r.focus.length).toBeGreaterThan(0);
    expect(provider.calls).toBe(1);
    expect(r.wording).toMatchObject({ source: "template", calls: 1 });
    expect(r.notes).toEqual(["model-failed"]);
    expect(warnings).toEqual(["rejected request"]);

    expect(await h.store.tracks()).toMatchObject([{ platform: "lichess", username: PLAYER, timeClass: "blitz" }]);
    expect(await h.store.latestReport(r.track)).toEqual(r);
    expect(await h.store.listPeriodStats(trackKey(r.track), settingsKey(r.settings))).toHaveLength(6);
    expect(h.reported).toEqual([{ report: r, pending: 0 }]);
    expect(h.starts).toBe(1);
    expect(h.quits).toBe(1);
    expect(complete).not.toHaveBeenCalled();
    expect(h.fetch.mock.calls[0]![2]).toMatchObject({ since: new Date("2026-08-21T12:00:00.000Z"), max: 20_000 });
  });

  it("extends to 90 days when 30 hold only 12 games", async () => {
    const recent = games(12, 1, 29);
    const older = games(15, 35, 85);
    const h = harness([...recent, ...older]);
    const r = (await runReport(h.deps(), opts())).report!;
    expect(r.gameIds).toHaveLength(20);
    expect(r.periodStart).toBe(older[7]!.playedAt);
  });

  it("with 7 games gives numbers only: few-games, no focus, no model call", async () => {
    const h = harness(games(7, 1, 20));
    const provider = failingProvider();
    const r = (await runReport(h.deps({ provider }), opts())).report!;
    expect(r.notes).toEqual(["few-games"]);
    expect(r.focus).toEqual([]);
    expect(r.current.games).toBe(7);
    expect(provider.calls).toBe(0);
    expect(r.wording.calls).toBe(0);
  });

  it("without a provider uses template wording and notes no-key", async () => {
    const h = harness(games(12, 1, 20));
    const r = (await runReport(h.deps(), opts())).report!;
    expect(r.notes).toEqual(["no-key"]);
    expect(r.wording).toEqual({ source: "template", wordedFor: [], calls: 0 });
    expect(r.focus.length).toBeGreaterThan(0);
  });

  it("picks the most-played time class", async () => {
    const h = harness([...games(12, 1, 29, { timeClass: "rapid" }), ...games(15, 1, 29, { timeClass: "blitz" })]);
    const r = (await runReport(h.deps(), opts())).report!;
    expect(r.track.timeClass).toBe("blitz");
    expect(r.gameIds).toHaveLength(15);
  });

  it("uses --band and reports the true count under --max-games", async () => {
    const h = harness(games(40, 0.5, 29));
    const r = (await runReport(h.deps(), opts({ band: "advanced", maxGames: 12 }))).report!;
    expect(r).toMatchObject({ band: "advanced", bandSource: "override", gamesFound: 40 });
    expect(r.gameIds).toHaveLength(40);
    expect(r.coverage).toMatchObject({ total: 12, analysed: 12, sampled: 12 });
  });

  it("starts nothing and reports waiting when the player has no rated games", async () => {
    const h = harness([]);
    expect(await runReport(h.deps(), opts())).toEqual({ status: "waiting", newGames: 0, needed: 10, pending: 0 });
    expect(await h.store.tracks()).toEqual([]);
    expect(h.starts).toBe(0);
  });
});

describe("runReport: later runs", () => {
  async function firstRun() {
    const h = harness(games(20, 0.5, 29));
    const first = (await runReport(h.deps(), opts())).report!;
    h.starts = 0;
    h.quits = 0;
    h.evaluator.positions = 0;
    return { h, first };
  }

  const week = (count: number, extra: Parameters<typeof game>[1] = {}) =>
    games(count, 0.5, 6.5, { asOf: WEEK_LATER, ...extra });

  it("is unchanged with no new games and starts no engine", async () => {
    const { h, first } = await firstRun();
    const out = await runReport(h.deps(), opts({ asOf: WEEK_LATER }));
    expect(out).toMatchObject({ status: "unchanged", newGames: 0, pending: 0 });
    expect(out.report).toEqual(first);
    expect(h.starts).toBe(0);
    expect(h.fetch.mock.calls[1]![2]).toMatchObject({ since: new Date("2026-11-16T12:00:00.000Z") });
  });

  it("waits with 6 new games (4 more needed), and --now forces a report", async () => {
    const { h, first } = await firstRun();
    h.available.push(...week(6));
    const waiting = await runReport(h.deps(), opts({ asOf: WEEK_LATER }));
    expect(waiting).toMatchObject({ status: "waiting", newGames: 6, needed: 4 });
    expect(waiting.report).toEqual(first);
    expect(h.starts).toBe(0);

    const forced = await runReport(h.deps(), opts({ asOf: WEEK_LATER, force: true }));
    expect(forced).toMatchObject({ status: "new", newGames: 6 });
    const r = forced.report!;
    expect(r).toMatchObject({ kind: "weekly", periodStart: AS_OF, periodEnd: WEEK_LATER, gamesFound: 6 });
    expect(r.notes).toContain("few-games");
    expect(r.comparison).toMatchObject({ games: 20, start: "2026-10-20T12:00:00.000Z", end: AS_OF });
    expect(r.trends).toHaveLength(9);
    // Each game is analysed once: only the six new ones, five positions each.
    expect(h.evaluator.positions).toBe(30);
    expect(await h.store.reports(r.track)).toHaveLength(2);
  });

  it("counts a late game once, in the first period that sees it", async () => {
    const { h, first } = await firstRun();
    const late = game(0.1); // started before the first report's end, fetched only now
    h.available.push(late, ...week(10));
    const second = (await runReport(h.deps(), opts({ asOf: WEEK_LATER }))).report!;
    expect(first.gameIds).not.toContain(late.id);
    expect(second.gameIds).toContain(late.id);
    expect(second.gameIds).toHaveLength(11);
    expect(second.comparison!.games).toBe(20);

    const third = await runReport(h.deps(), opts({ asOf: "2026-12-03T12:00:00.000Z", force: true }));
    expect(third).toMatchObject({ status: "unchanged", newGames: 0 });
  });

  it("notes settings-changed on a new depth and re-analyses the window at it", async () => {
    const { h } = await firstRun();
    h.available.push(...week(10));
    const r = (await runReport(h.deps(), opts({ asOf: WEEK_LATER, depth: 14 }))).report!;
    expect(r.notes).toContain("settings-changed");
    expect(r.settings.engine.depth).toBe(14);
    expect(r.comparison).toMatchObject({ games: 20 });
    expect(r.coverage.complete).toBe(true);
    // The 10 new games and the 20 earlier ones in the window, all at depth 14.
    expect(h.evaluator.positions).toBe(150);
  });

  it("rejects an asOf earlier than the latest report", async () => {
    const { h } = await firstRun();
    await expect(runReport(h.deps(), opts({ asOf: "2026-11-01T00:00:00.000Z" }))).rejects.toThrow(ReportInputError);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("asks to resume an unfinished report first, but not with --sample-only", async () => {
    const { h, first } = await firstRun();
    await runReport(h.deps(), opts({ asOf: WEEK_LATER }));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]![1]).toEqual(first.track);
    complete.mockClear();
    await runReport(h.deps(), opts({ asOf: WEEK_LATER, sampleOnly: true }));
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("runReport: the engine and the sample", () => {
  it("does not start the engine when every game is already analysed", async () => {
    const all = games(12, 1, 20);
    const h = harness(all);
    await h.store.putGames(all);
    const pre = stubEvaluator();
    for (const g of all) await h.store.putAnalysis(await analyzeGame(pre, g, { depth: 12 }));
    const r = (await runReport(h.deps(), opts())).report!;
    expect(h.starts).toBe(0);
    expect(h.quits).toBe(0);
    expect(r.settings.engine.name).toBe("stub-engine");
    expect(r.coverage.complete).toBe(true);
  });

  it("quits the engine when analysis fails", async () => {
    const h = harness(games(12, 1, 20));
    h.evaluator.evaluate = async () => {
      throw new Error("engine died");
    };
    await expect(runReport(h.deps(), opts())).rejects.toThrow("engine died");
    expect(h.starts).toBe(1);
    expect(h.quits).toBe(1);
    expect(await h.store.latestReport({ platform: "lichess", username: PLAYER, timeClass: "blitz" })).toBeUndefined();
  });

  it("stores a provisional sample of 150, then hands the rest to completion", async () => {
    const h = harness(games(200, 0.5, 29));
    const progress: number[] = [];
    const out = await runReport(h.deps({ onProgress: (e) => progress.push(e.done) }), opts());
    const r = out.report!;
    expect(r.coverage).toEqual({ sampled: 150, analysed: 150, total: 200, complete: false, sampleOnly: false });
    expect(r.gamesFound).toBe(200);
    expect(out.pending).toBe(50);
    expect(h.reported).toEqual([{ report: r, pending: 50 }]);
    expect(progress).toHaveLength(150);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(await h.store.listPeriodStats(trackKey(r.track), settingsKey(r.settings))).toEqual([]);
    expect(h.quits).toBe(1);
  });

  it("with --sample-only stops after the sample as a final report", async () => {
    const h = harness(games(200, 0.5, 29));
    const r = (await runReport(h.deps(), opts({ sampleOnly: true }))).report!;
    expect(r.coverage).toMatchObject({ analysed: 150, complete: false, sampleOnly: true });
    expect(r.notes).toContain("sample-only");
    expect(complete).not.toHaveBeenCalled();
    expect(await h.store.listPeriodStats(trackKey(r.track), settingsKey(r.settings))).toHaveLength(6);
  });
});
