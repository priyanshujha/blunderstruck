import { settingsKey, trackKey, WeeklyReport, type Track } from "@blunderstruck/contracts";
import { analyzeGame, checkGame } from "@blunderstruck/engine";
import { selectGames } from "@blunderstruck/progress";
import { describe, expect, it } from "vitest";
import { AnalysisAborted } from "./analyse";
import { completeReport } from "./complete";
import { runReport, type ReportDeps } from "./run";
import {
  games,
  harness,
  opts,
  PLAYER,
  resetCounts,
  START_BOARD,
  stubEvaluator,
  WEEK_LATER,
  wordingProvider,
  type Harness,
} from "./test-helpers";

const TRACK: Track = { platform: "lichess", username: PLAYER, timeClass: "blitz" };
/** Positions the stub engine scores per generated game at the first look. */
const FIRST_LOOK = 5;
/** Positions a check scores per generated game: 1. e4 is the only flagged move, before and after. */
const CHECK = 2;

type Progress = Parameters<NonNullable<ReportDeps["onProgress"]>>[0];

function recorder() {
  const events: Progress[] = [];
  return { events, of: (phase: Progress["phase"]) => events.filter((e) => e.phase === phase), onProgress: (e: Progress) => events.push(e) };
}

const at = (h: Harness, depth: number) => h.evaluator.byDepth.get(depth) ?? 0;
const checked = (over: Parameters<typeof opts>[0] = {}) => opts({ checkDepth: 18, ...over });

describe("the deeper check: two passes", () => {
  it("revision 0 is the first look with checked 0; revision 1 is complete and checked, each game looked at once", async () => {
    const h = harness(games(20, 0.5, 29));
    const p = recorder();
    const out = await runReport(h.deps({ onProgress: p.onProgress }), checked());

    const [r0, r1] = h.reported.map((x) => x.report);
    expect(h.reported.map((x) => [x.report.revision, x.pending])).toEqual([
      [0, 20],
      [1, 0],
    ]);
    expect(r0!.settings).toMatchObject({ checkDepth: 18, engine: { depth: 12 } });
    expect(settingsKey(r0!.settings)).toMatch(/\.c18$/);
    expect(r0!.coverage).toEqual({ sampled: 20, analysed: 20, total: 20, complete: false, sampleOnly: false, checked: 0 });
    expect(r1!.coverage).toEqual({ sampled: 20, analysed: 20, total: 20, complete: true, sampleOnly: false, checked: 20 });
    expect(r1!.settings).toEqual(r0!.settings);
    expect(() => WeeklyReport.parse(r1)).not.toThrow();
    expect(out).toMatchObject({ status: "new", pending: 0, report: r1 });

    // No game gets a second first look; each is checked once.
    expect(at(h, 12)).toBe(20 * FIRST_LOOK);
    expect(at(h, 18)).toBe(20 * CHECK);
    expect(h.starts).toBe(1);
    expect(h.quits).toBe(1);

    const check = p.of("check");
    expect(check[0]).toEqual({ phase: "check", done: 0, total: 20, etaSeconds: null });
    expect(check.at(-1)).toMatchObject({ done: 20, total: 20, etaSeconds: 0 });
    expect(p.of("full")).toEqual([]);

    // Only the final revision writes weekly rows, under the checked settings.
    expect(await h.store.listPeriodStats(trackKey(TRACK), settingsKey(r1!.settings))).toHaveLength(6);
    const stored = await h.store.getAnalyses(r1!.gameIds, { analysisVersion: r1!.settings.analysisVersion, depth: 12, checkDepth: 18 });
    expect(stored.size).toBe(20);
    expect([...stored.values()].every((a) => a.check?.depth === 18 && a.check.colors.join() === "white")).toBe(true);
    // The first looks stay stored too.
    const first = await h.store.analysedIds(r1!.gameIds, { analysisVersion: r1!.settings.analysisVersion, depth: 12, checkDepth: 0 });
    expect(first.size).toBe(20);
  });

  it("400 games: the 150 sampled are only checked, the other 250 analysed and checked", async () => {
    const h = harness(games(400, 0.5, 29));
    const p = recorder();
    await runReport(h.deps({ onProgress: p.onProgress }), checked());
    const [r0, r1] = h.reported.map((x) => x.report);
    expect(r0!.coverage).toEqual({ sampled: 150, analysed: 150, total: 400, complete: false, sampleOnly: false, checked: 0 });
    expect(r1!.coverage).toEqual({ sampled: 150, analysed: 400, total: 400, complete: true, sampleOnly: false, checked: 400 });
    expect(h.reported.map((x) => x.pending)).toEqual([400, 0]);
    expect(p.of("full")[0]).toEqual({ phase: "full", done: 0, total: 400, etaSeconds: null });
    expect(p.of("check")).toEqual([]);
    expect(at(h, 12)).toBe(400 * FIRST_LOOK);
    expect(at(h, 18)).toBe(400 * CHECK);
  });

  it("the completed revision is built from the checked values", async () => {
    const h = harness(games(20, 0.5, 29));
    const base = h.evaluator.evaluate.bind(h.evaluator);
    // At depth 18 the start is level, so 1. e4 loses nothing there.
    h.evaluator.evaluate = async (fen, depth) => {
      const r = await base(fen, depth);
      return depth === 18 && fen.startsWith(START_BOARD) ? { score: { cp: 0 }, depth } : r;
    };
    await runReport(h.deps(), checked());
    const [r0, r1] = h.reported.map((x) => x.report);
    expect(r0!.current.mistakesPer100Moves).toBeGreaterThan(0);
    expect(r1!.current.mistakesPer100Moves).toBe(0);
    expect(r1!.current.stats.every((s) => s.occurrences === 0)).toBe(true);
  });

  it("--check-depth 0 keeps the unchecked settings and keys, and never checks", async () => {
    const h = harness(games(20, 0.5, 29));
    const r = (await runReport(h.deps(), opts({ checkDepth: 0 }))).report!;
    expect(r.settings).toEqual({ analysisVersion: r.settings.analysisVersion, patternsVersion: r.settings.patternsVersion, engine: { name: "stub-engine", depth: 12 } });
    expect(settingsKey(r.settings)).toBe(`a${r.settings.analysisVersion}.p${r.settings.patternsVersion}.d12.stub-engine`);
    expect(r.coverage).toEqual({ sampled: 20, analysed: 20, total: 20, complete: true, sampleOnly: false });
    expect(h.reported).toHaveLength(1);
    expect(at(h, 12)).toBe(20 * FIRST_LOOK);
    expect([...h.evaluator.byDepth.keys()]).toEqual([12]);
  });

  it("defaults to a check at depth 18", async () => {
    const h = harness(games(12, 1, 20));
    const { checkDepth: _omit, ...rest } = opts();
    const r = (await runReport(h.deps(), rest)).report!;
    expect(r.settings.checkDepth).toBe(18);
    expect(r.coverage).toMatchObject({ complete: true, checked: 12 });
  });

  it("refuses a check depth that is not a whole number", async () => {
    const h = harness(games(12, 1, 20));
    await expect(runReport(h.deps(), opts({ checkDepth: -1 }))).rejects.toThrow(/--check-depth/);
    await expect(runReport(h.deps(), opts({ checkDepth: 1.5 }))).rejects.toThrow(/--check-depth/);
  });
});

describe("the deeper check: reuse", () => {
  async function prepared(colorOf: (i: number) => "white" | "black" | null) {
    const all = games(12, 1, 20);
    const h = harness(all);
    await h.store.putGames(all);
    const pre = stubEvaluator();
    for (const [i, g] of all.entries()) {
      const a = { ...(await analyzeGame(pre, g, { depth: 12 })), engine: { name: "stub-engine", depth: 12 } };
      await h.store.putAnalysis(a);
      const color = colorOf(i);
      if (color) await h.store.putAnalysis(await checkGame(pre, a, { depth: 18, color }));
    }
    return { h, all };
  }

  it("a game checked for the player's colour is not checked again, and nothing starts the engine", async () => {
    const { h } = await prepared(() => "white");
    const r = (await runReport(h.deps(), checked())).report!;
    expect(h.starts).toBe(0);
    expect(h.evaluator.positions).toBe(0);
    expect(r).toMatchObject({ revision: 0, coverage: { complete: true, checked: 12, analysed: 12 } });
    expect(h.reported).toHaveLength(1);
  });

  it("a game checked only for the other colour gets the player's check; first looks are reused", async () => {
    const { h, all } = await prepared((i) => (i < 3 ? "black" : i < 5 ? null : "white"));
    const p = recorder();
    const r = (await runReport(h.deps({ onProgress: p.onProgress }), checked())).report!;
    expect(at(h, 12)).toBe(0);
    expect(at(h, 18)).toBe(5 * CHECK);
    expect(p.of("check")[0]).toMatchObject({ done: 0, total: 5 });
    expect(r).toMatchObject({ revision: 1, coverage: { complete: true, checked: 12 } });
    const stored = await h.store.getAnalyses(all.slice(0, 5).map((g) => g.id), { analysisVersion: r.settings.analysisVersion, depth: 12, checkDepth: 18 });
    expect([...stored.values()].map((a) => a.check!.colors)).toEqual([
      ["white", "black"],
      ["white", "black"],
      ["white", "black"],
      ["white"],
      ["white"],
    ]);
  });
});

describe("the deeper check: stop and resume", () => {
  it("an abort during the check stage loses at most the game in progress; the next run checks only the rest", async () => {
    const h = harness(games(20, 0.5, 29));
    const controller = new AbortController();
    const onProgress = (e: Progress) => {
      if (e.phase === "check" && e.done === 5) controller.abort();
    };
    const err = await runReport(h.deps({ signal: controller.signal, onProgress }), checked()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnalysisAborted);
    expect(err).toMatchObject({ done: 5, total: 20, message: "Stopped: 5 of 20 checked" });
    expect((await h.store.latestReport(TRACK))!).toMatchObject({ revision: 0, coverage: { complete: false, checked: 0 } });
    expect(h.quits).toBe(1);

    resetCounts(h.evaluator);
    const p = recorder();
    const out = await runReport(h.deps({ onProgress: p.onProgress }), checked());
    expect(out.status).toBe("resumed");
    expect(p.of("check")[0]).toMatchObject({ done: 0, total: 15 });
    expect(at(h, 12)).toBe(0);
    expect(at(h, 18)).toBe(15 * CHECK);
    expect(out.report).toMatchObject({ revision: 1, coverage: { complete: true, checked: 20 } });
  });

  it("a stop between a game's first look and its check keeps that first look", async () => {
    const h = harness(games(160, 0.5, 29));
    const controller = new AbortController();
    let pass2 = false;
    let looks = 0;
    const base = h.evaluator.evaluate.bind(h.evaluator);
    h.evaluator.evaluate = async (fen, depth) => {
      const r = await base(fen, depth);
      // Stop once the first game of pass 2 has had its whole first look.
      if (pass2 && depth === 12 && ++looks === FIRST_LOOK) controller.abort();
      return r;
    };
    const onProgress = (e: Progress) => {
      if (e.phase === "full" && e.done === 0) pass2 = true;
    };
    const err = await runReport(h.deps({ signal: controller.signal, onProgress }), checked()).catch((e: unknown) => e);
    // Games are taken in play order, so a few sampled ones were checked before the stop.
    expect(err).toBeInstanceOf(AnalysisAborted);
    expect(err).toMatchObject({ total: 160, what: "checked" });
    const before = (err as AnalysisAborted).done;

    h.evaluator.evaluate = base;
    resetCounts(h.evaluator);
    const out = await runReport(h.deps(), checked());
    // 150 sampled and 1 stopped after its first look: only the other 9 are looked at again.
    expect(at(h, 12)).toBe(9 * FIRST_LOOK);
    expect(at(h, 18)).toBe((160 - before) * CHECK);
    expect(out.report).toMatchObject({ coverage: { complete: true, analysed: 160, checked: 160 } });
  });
});

describe("the deeper check: settings", () => {
  it("a new check depth between runs is a settings change: first looks are reused, checks at 18 are not", async () => {
    const h = harness(games(20, 0.5, 29));
    await runReport(h.deps(), checked());
    resetCounts(h.evaluator);
    h.reported.length = 0;
    h.available.push(...games(10, 0.5, 6.5, { asOf: WEEK_LATER }));

    const out = await runReport(h.deps(), checked({ asOf: WEEK_LATER, checkDepth: 22 }));
    const r = out.report!;
    expect(r.notes).toContain("settings-changed");
    expect(r.settings.checkDepth).toBe(22);
    expect(r.coverage).toMatchObject({ complete: true, checked: 10 });
    expect(r.comparison).toMatchObject({ games: 20 });
    expect(h.reported.map((x) => [x.report.revision, x.report.coverage.checked])).toEqual([
      [0, 0],
      [1, 10],
    ]);
    expect(at(h, 12)).toBe(10 * FIRST_LOOK);
    expect(at(h, 18)).toBe(0);
    expect(at(h, 22)).toBe(30 * CHECK);
  });

  it("a resume with another check depth rebuilds the period at it", async () => {
    const h = harness(games(20, 0.5, 29));
    const controller = new AbortController();
    const stop = (e: Progress) => {
      if (e.phase === "check" && e.done === 5) controller.abort();
    };
    await expect(runReport(h.deps({ signal: controller.signal, onProgress: stop }), checked())).rejects.toThrow(AnalysisAborted);
    resetCounts(h.evaluator);
    const out = await runReport(h.deps(), checked({ checkDepth: 20 }));
    expect(out.status).toBe("resumed");
    expect(out.report!.settings.checkDepth).toBe(20);
    expect(out.report!.notes).toContain("settings-changed");
    expect(out.report!.coverage).toMatchObject({ complete: true, checked: 20 });
    expect(at(h, 12)).toBe(0);
    expect(at(h, 20)).toBe(20 * CHECK);
  });
});

describe("the deeper check: --sample-only", () => {
  it("checks its sample before storing the one final revision, and a later run completes it", async () => {
    const h = harness(games(200, 0.5, 29));
    const p = recorder();
    const r0 = (await runReport(h.deps({ onProgress: p.onProgress }), checked({ sampleOnly: true }))).report!;
    expect(h.reported.map((x) => [x.report.revision, x.pending])).toEqual([[0, 50]]);
    expect(r0.coverage).toEqual({ sampled: 150, analysed: 150, total: 200, complete: false, sampleOnly: true, checked: 150 });
    expect(r0.notes).toContain("sample-only");
    expect(p.of("check")[0]).toMatchObject({ done: 0, total: 150 });
    expect(at(h, 12)).toBe(150 * FIRST_LOOK);
    expect(at(h, 18)).toBe(150 * CHECK);
    expect(await h.store.listPeriodStats(trackKey(TRACK), settingsKey(r0.settings))).toHaveLength(6);

    resetCounts(h.evaluator);
    const out = await runReport(h.deps(), checked());
    expect(out.status).toBe("resumed");
    expect(out.report!.coverage).toEqual({ sampled: 150, analysed: 200, total: 200, complete: true, sampleOnly: false, checked: 200 });
    expect(at(h, 12)).toBe(50 * FIRST_LOOK);
    expect(at(h, 18)).toBe(50 * CHECK);
  });

  it("a stop during its check stores nothing; the next sample-only run checks only the rest", async () => {
    const h = harness(games(200, 0.5, 29));
    const controller = new AbortController();
    const stop = (e: Progress) => {
      if (e.phase === "check" && e.done === 40) controller.abort();
    };
    await expect(runReport(h.deps({ signal: controller.signal, onProgress: stop }), checked({ sampleOnly: true }))).rejects.toThrow(
      "Stopped: 40 of 150 checked",
    );
    expect(await h.store.latestReport(TRACK)).toBeUndefined();
    resetCounts(h.evaluator);
    const r = (await runReport(h.deps(), checked({ sampleOnly: true }))).report!;
    expect(at(h, 12)).toBe(0);
    expect(at(h, 18)).toBe(110 * CHECK);
    expect(r.coverage).toMatchObject({ sampleOnly: true, checked: 150 });
  });
});

describe("capped reports", () => {
  it("record the ids they kept, on every revision, and only when capped", async () => {
    const h = harness(games(400, 0.5, 29));
    await runReport(h.deps(), opts({ maxGames: 200 }));
    const [r0, r1] = h.reported.map((x) => x.report);
    const period = (await h.store.games({ platform: "lichess", username: PLAYER, timeClass: "blitz" })).filter((g) =>
      r1!.gameIds.includes(g.id),
    );
    const kept = selectGames(period, 200, r1!.periodEnd).map((g) => g.id);
    expect([...r1!.cappedGameIds!].sort()).toEqual([...kept].sort());
    expect(r0!.cappedGameIds).toEqual(r1!.cappedGameIds);

    const plain = harness(games(20, 0.5, 29));
    expect((await runReport(plain.deps(), opts())).report!.cappedGameIds).toBeUndefined();
  });

  async function cappedThenNext(edit: (r: WeeklyReport) => WeeklyReport) {
    const h = harness(games(400, 0.5, 29));
    const first = (await runReport(h.deps(), opts({ maxGames: 200 }))).report!;
    const replaced = edit({ ...first, revision: first.revision + 1 });
    expect(await h.store.putReport(replaced)).toBe("stored");
    resetCounts(h.evaluator);
    h.available.push(...games(20, 0.5, 6.5, { asOf: WEEK_LATER }));
    const next = (await runReport(h.deps(), opts({ asOf: WEEK_LATER }))).report!;
    return { h, first, next };
  }

  it("later periods use the recorded ids instead of recomputing the cut", async () => {
    // Record another 200 ids than the cut would give: the next period must follow the record.
    let other: string[] = [];
    let overlap = 0;
    const { h, next } = await cappedThenNext((r) => {
      other = r.gameIds.slice(0, 200);
      overlap = other.filter((id) => r.cappedGameIds!.includes(id)).length;
      return { ...r, cappedGameIds: other };
    });
    expect(overlap).toBeLessThan(200);
    expect(next.comparison!.games).toBe(200);
    // The 20 new games, and the recorded games the first report had not analysed.
    expect(h.evaluator.positions).toBe((20 + 200 - overlap) * FIRST_LOOK);
    const analysed = await h.store.analysedIds(other, { analysisVersion: next.settings.analysisVersion, depth: 12, checkDepth: 0 });
    expect(analysed.size).toBe(200);
  });

  it("a report stored before the field falls back to recomputing the cut", async () => {
    const { h, next } = await cappedThenNext(({ cappedGameIds: _drop, ...r }) => r);
    expect(h.evaluator.positions).toBe(20 * FIRST_LOOK);
    expect(next.comparison!.games).toBe(200);
  });

  it("a capped report with the check on checks only the kept games", async () => {
    const h = harness(games(400, 0.5, 29));
    const r = (await runReport(h.deps(), checked({ maxGames: 200 }))).report!;
    expect(r.coverage).toEqual({ sampled: 150, analysed: 200, total: 200, complete: true, sampleOnly: false, checked: 200 });
    expect(at(h, 18)).toBe(200 * CHECK);
    expect(r.cappedGameIds).toHaveLength(200);
  });
});

describe("completeReport with the check", () => {
  it("defaults to the stored report's check depth", async () => {
    const h = harness(games(20, 0.5, 29));
    const controller = new AbortController();
    await expect(
      runReport(h.deps({ signal: controller.signal, onProgress: (e) => e.phase === "check" && controller.abort() }), checked()),
    ).rejects.toThrow(AnalysisAborted);
    const r1 = (await completeReport(h.deps(), TRACK))!;
    expect(r1).toMatchObject({ revision: 1, settings: { checkDepth: 18 }, coverage: { complete: true, checked: 20 } });
    expect(r1.notes).not.toContain("settings-changed");
  });
});

describe("the deeper check: wording across revisions", () => {
  it("an unchanged focus whose examples are still findings after the check makes no second call", async () => {
    const h = harness(games(20, 0.5, 29));
    const provider = wordingProvider();
    await runReport(h.deps({ provider }), checked());
    const [r0, r1] = h.reported.map((x) => x.report);
    expect(r1!.focus.map((f) => f.patternId)).toEqual(r0!.focus.map((f) => f.patternId));
    expect(r1!.focus.map((f) => f.examples.map((e) => [e.gameId, e.ply]))).toEqual(
      r0!.focus.map((f) => f.examples.map((e) => [e.gameId, e.ply])),
    );
    expect(provider.calls).toBe(1);
    expect(r1!.focus.map((f) => [f.title, f.why, f.drill])).toEqual(r0!.focus.map((f) => [f.title, f.why, f.drill]));
  });

  it("an example the check drops forces one reword of its item, within the budget", async () => {
    const h = harness(games(20, 0.5, 29));
    const provider = wordingProvider();
    let dropped: string | undefined;
    let order: string[] = [];
    const base = h.evaluator.evaluate.bind(h.evaluator);
    let deep = 0;
    // At depth 18, the start is level in the first example's game only, so its 1. e4 is no mistake there.
    h.evaluator.evaluate = async (fen, depth) => {
      const r = await base(fen, depth);
      if (depth !== 18) return r;
      const game = order[Math.floor(deep++ / CHECK)];
      return game === dropped && fen.startsWith(START_BOARD) ? { score: { cp: 0 }, depth } : r;
    };
    const deps = h.deps({ provider });
    await runReport(
      {
        ...deps,
        onReport: (report, info) => {
          if (report.revision === 0) {
            dropped = report.focus.flatMap((f) => f.examples)[0]?.gameId;
            order = report.gameIds;
          }
          deps.onReport!(report, info);
        },
      },
      checked(),
    );
    const [r0, r1] = h.reported.map((x) => x.report);
    expect(dropped).toBeDefined();
    const item = r0!.focus.find((f) => f.examples.some((e) => e.gameId === dropped))!;
    const after = r1!.focus.find((f) => f.patternId === item.patternId)!;
    expect(after.examples.map((e) => e.gameId)).not.toContain(dropped);
    expect(provider.calls).toBe(2);
    expect(r1!.wording.calls).toBeLessThanOrEqual(3);
    expect(provider.requests[1]!.user).toContain(`Word these focus items, in this order: ${item.patternId}`);
  });
});
