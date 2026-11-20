import { settingsKey, trackKey, WeeklyReport, type GameRecord, type Track } from "@blunderstruck/contracts";
import { templateWording, type CoachProvider } from "@blunderstruck/coach";
import { analyzeGame } from "@blunderstruck/engine";
import { selectGames } from "@blunderstruck/progress";
import type { Store } from "@blunderstruck/store";
import { describe, expect, it } from "vitest";
import { AnalysisAborted } from "./analyse";
import { buildDraft } from "./assemble";
import { completeReport } from "./complete";
import { runReport, type ReportDeps } from "./run";
import {
  AS_OF,
  DAY,
  failingProvider,
  games,
  harness,
  opts,
  PLAYER,
  stubEvaluator,
  WEEK_LATER,
  wordingProvider,
  type Harness,
} from "./test-helpers";

const TRACK: Track = { platform: "lichess", username: PLAYER, timeClass: "blitz" };
/** Positions the stub engine scores per short generated game. */
const POSITIONS_PER_GAME = 5;

type Progress = Parameters<NonNullable<ReportDeps["onProgress"]>>[0];

function recorder() {
  const events: Progress[] = [];
  return { events, full: () => events.filter((e) => e.phase === "full"), onProgress: (e: Progress) => events.push(e) };
}

/** Aborts the run once pass 2 has analysed `after` games. */
function abortAfter(after: number) {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    onProgress: (e: Progress) => {
      if (e.phase === "full" && e.done === after) controller.abort();
    },
  };
}

/** A run of `count` games in the 30 days before asOf whose second pass is stopped before it starts. */
async function provisional(count = 400, extra: Partial<Parameters<typeof opts>[0]> = {}) {
  const h = harness(games(count, 0.5, 29));
  await expect(runReport(h.deps(abortAfter(0)), opts(extra))).rejects.toThrow(AnalysisAborted);
  const r0 = (await h.store.latestReport(TRACK))!;
  expect(r0.coverage.complete).toBe(false);
  h.starts = 0;
  h.quits = 0;
  h.evaluator.positions = 0;
  h.reported.length = 0;
  return { h, r0 };
}

/**
 * Games whose sample shows one habit and whose full set shows a second: a third of the games
 * left out of the sample are long and end in a blunder made with 5 s on the clock.
 */
function focusChangingGames(h: Harness, all: GameRecord[]) {
  const moves = ["1. d4 { [%clk 0:00:05] } d5 { [%clk 0:02:59] }"];
  for (let n = 2; n <= 14; n++) {
    const [w, b] = n % 2 === 0 ? ["Nf3", "Nf6"] : ["Ng1", "Ng8"];
    moves.push(`${n}. ${w} { [%clk 0:00:05] } ${b} { [%clk 0:02:59] }`);
  }
  const long = `${moves.join(" ")} *`;
  const sample = new Set(selectGames(all, 150, AS_OF).map((g) => g.id));
  let i = 0;
  for (const g of all) if (!sample.has(g.id) && i++ % 2 === 0) g.pgn = long;
  const base = h.evaluator.evaluate.bind(h.evaluator);
  // White to move at move 14 is clearly winning, so 14. Nf3 throws it away.
  h.evaluator.evaluate = async (fen, depth) => (/ w \S+ \S+ \d+ 14$/.test(fen) ? { score: { cp: 600 }, depth } : base(fen, depth));
}

describe("completeReport: the second pass", () => {
  it("400 games: revision 0 is the 150-game sample, revision 1 is complete, with progress and weekly rows", async () => {
    const h = harness(games(400, 0.5, 29));
    const p = recorder();
    const out = await runReport(h.deps({ onProgress: p.onProgress }), opts());

    const [r0, r1] = h.reported.map((x) => x.report);
    expect(r0!.revision).toBe(0);
    expect(r0!.coverage).toEqual({ sampled: 150, analysed: 150, total: 400, complete: false, sampleOnly: false });
    expect(r1!.revision).toBe(1);
    expect(r1!.coverage).toEqual({ sampled: 150, analysed: 400, total: 400, complete: true, sampleOnly: false });
    expect(r1).toMatchObject({ gamesFound: 400, gamesAnalyzed: 400, periodStart: r0!.periodStart, periodEnd: r0!.periodEnd });
    expect(r1!.gameIds).toEqual(r0!.gameIds);
    expect(r1!.current.games).toBe(400);
    expect(() => WeeklyReport.parse(r1)).not.toThrow();
    expect(h.reported.map((x) => x.pending)).toEqual([250, 0]);
    expect(out).toMatchObject({ status: "new", pending: 0, report: r1 });

    const full = p.full();
    expect(full).toHaveLength(251);
    expect(full[0]).toEqual({ phase: "full", done: 0, total: 250, etaSeconds: null });
    expect(full.at(-1)).toMatchObject({ done: 250, total: 250, etaSeconds: 0 });

    expect(await h.store.latestReport(TRACK)).toEqual(r1);
    expect(await h.store.listPeriodStats(trackKey(TRACK), settingsKey(r1!.settings))).toHaveLength(6);
    expect(h.evaluator.positions).toBe(400 * POSITIONS_PER_GAME);
    expect(h.starts).toBe(1);
    expect(h.quits).toBe(1);
  });

  it("estimates time left from the mean seconds per game this run, timed with deps.now", async () => {
    const { h } = await provisional(160);
    let t = Date.parse(AS_OF);
    const p = recorder();
    // Each reading of the clock moves it on 2 s: one reading at the start, one after each game.
    await completeReport(h.deps({ now: () => new Date((t += 2000)), onProgress: p.onProgress }), TRACK);
    expect(p.full().map((e) => e.etaSeconds)).toEqual([null, ...Array.from({ length: 10 }, (_, i) => 2 * (9 - i))]);
  });

  it("stops between games on abort, then a later run resumes with only the games left", async () => {
    const h = harness(games(400, 0.5, 29));
    const err = await runReport(h.deps(abortAfter(50)), opts()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnalysisAborted);
    expect(err).toMatchObject({ done: 50, total: 250, message: "Stopped: 50 of 250 analysed" });
    expect(h.quits).toBe(1);
    const stored = (await h.store.latestReport(TRACK))!;
    expect(stored).toMatchObject({ revision: 0, coverage: { complete: false } });

    h.evaluator.positions = 0;
    const p = recorder();
    const out = await runReport(h.deps({ onProgress: p.onProgress }), opts());
    expect(p.full()[0]).toMatchObject({ done: 0, total: 200 });
    // Finished games are not analysed again.
    expect(h.evaluator.positions).toBe(200 * POSITIONS_PER_GAME);
    expect(out).toMatchObject({ status: "resumed", pending: 0 });
    expect(out.report).toMatchObject({ revision: 1, coverage: { analysed: 400, complete: true } });
  });

  it("with --max-games 200 analyses only those 200, and total stays 200", async () => {
    const h = harness(games(400, 0.5, 29));
    const p = recorder();
    const out = await runReport(h.deps({ onProgress: p.onProgress }), opts({ maxGames: 200 }));
    expect(h.reported[0]!.report.coverage).toMatchObject({ sampled: 150, analysed: 150, total: 200, complete: false });
    expect(out.report!.coverage).toEqual({ sampled: 150, analysed: 200, total: 200, complete: true, sampleOnly: false });
    expect(out.report!.gamesFound).toBe(400);
    expect(out.report!.gameIds).toHaveLength(400);
    expect(p.full()[0]).toMatchObject({ total: 50 });
    expect(h.evaluator.positions).toBe(200 * POSITIONS_PER_GAME);
  });
});

describe("completeReport: --sample-only", () => {
  it("stops after the sample as a final report; a later run without the flag completes it", async () => {
    const h = harness(games(400, 0.5, 29));
    const r0 = (await runReport(h.deps(), opts({ sampleOnly: true }))).report!;
    expect(r0.coverage).toMatchObject({ analysed: 150, complete: false, sampleOnly: true });

    // Another sample-only run leaves it as it is and starts nothing.
    h.starts = 0;
    const again = await runReport(h.deps(), opts({ sampleOnly: true }));
    expect(again).toMatchObject({ status: "unchanged", report: r0 });
    expect(h.starts).toBe(0);

    const out = await runReport(h.deps(), opts());
    expect(out.status).toBe("resumed");
    expect(out.report!.revision).toBe(1);
    expect(out.report!.coverage).toMatchObject({ analysed: 400, complete: true, sampleOnly: false });
    expect(out.report!.notes).not.toContain("sample-only");
  });

  it("an interrupted resume leaves the stored report sample-only and final", async () => {
    const h = harness(games(400, 0.5, 29));
    await runReport(h.deps(), opts({ sampleOnly: true }));
    await expect(runReport(h.deps(abortAfter(10)), opts())).rejects.toThrow(AnalysisAborted);
    expect((await h.store.latestReport(TRACK))!).toMatchObject({ revision: 0, coverage: { sampleOnly: true } });
  });
});

describe("completeReport: wording", () => {
  it("an unchanged focus makes 1 call in all and keeps the wording, with the numbers refreshed", async () => {
    const h = harness(games(400, 0.5, 29));
    const provider = wordingProvider();
    const out = await runReport(h.deps({ provider }), opts());
    const [r0, r1] = h.reported.map((x) => x.report);
    expect(provider.calls).toBe(1);
    expect(r1!.focus.map((f) => f.patternId)).toEqual(r0!.focus.map((f) => f.patternId));
    expect(r1!.focus.map((f) => [f.title, f.why, f.drill])).toEqual(r0!.focus.map((f) => [f.title, f.why, f.drill]));
    expect(r1!.summary).toBe(r0!.summary);
    expect(r1!.wording).toEqual(r0!.wording);
    expect(r1!.wording).toMatchObject({ source: "model", calls: 1 });
    expect(r1!.current.games).toBeGreaterThan(r0!.current.games);
    expect(out.report).toEqual(r1);
  });

  it("a changed focus makes one reword call for the new item only, 2 in all", async () => {
    const all = games(400, 0.5, 29);
    const h = harness(all);
    focusChangingGames(h, all);
    const provider = wordingProvider();
    await runReport(h.deps({ provider }), opts());
    const [r0, r1] = h.reported.map((x) => x.report);
    expect(r0!.focus.map((f) => f.patternId)).toEqual(["opening-trouble"]);
    expect(r1!.focus.map((f) => f.patternId)).toEqual(["opening-trouble", "time-trouble"]);
    expect(provider.calls).toBe(2);
    expect(provider.requests[1]!.user).toContain("Word these focus items, in this order: time-trouble.");
    expect(r1!.focus[0]!.why).toBe(r0!.focus[0]!.why);
    expect(r1!.focus[1]!.title).toBe("Model title time-trouble");
    expect(r1!.wording).toMatchObject({ source: "model", calls: 2, wordedFor: ["opening-trouble", "time-trouble"] });
    expect(r1!.notes).not.toContain("model-failed");
  });

  it("a changed focus whose reword call fails gives template text for the new item and notes model-failed", async () => {
    const all = games(400, 0.5, 29);
    const h = harness(all);
    focusChangingGames(h, all);
    const provider = wordingProvider(2);
    const warnings: string[] = [];
    await runReport(h.deps({ provider, onWarning: (m) => warnings.push(m) }), opts());
    const [r0, r1] = h.reported.map((x) => x.report);
    expect(r0!.notes).not.toContain("model-failed");
    expect(provider.calls).toBe(2);
    const template = templateWording(r1!).focus.find((f) => f.patternId === "time-trouble")!;
    expect(r1!.focus[1]).toMatchObject({ patternId: "time-trouble", title: template.title, why: template.why });
    expect(r1!.focus[0]!.title).toBe("Model title opening-trouble");
    expect(r1!.notes).toContain("model-failed");
    expect(r1!.wording).toMatchObject({ calls: 2, wordedFor: ["opening-trouble"] });
    expect(warnings).toEqual(["rejected request"]);
  });

  it("never makes more than three calls for one report", async () => {
    const all = games(400, 0.5, 29);
    const h = harness(all);
    focusChangingGames(h, all);
    let calls = 0;
    const provider: CoachProvider = {
      name: "anthropic",
      model: "test-model",
      async complete() {
        calls++;
        return { text: "not json", usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } };
      },
    };
    await runReport(h.deps({ provider }), opts());
    const [r0, r1] = h.reported.map((x) => x.report);
    expect(r0!.wording.calls).toBe(2); // the plan and its repair
    expect(r1!.wording.calls).toBe(3); // one reword, no repair
    expect(calls).toBe(3);
    expect(r1!.notes).toContain("model-failed");
  });

  it("keeps model-failed when a failed revision's template text is carried over unchanged", async () => {
    const h = harness(games(400, 0.5, 29));
    const provider = failingProvider();
    await runReport(h.deps({ provider }), opts());
    const [r0, r1] = h.reported.map((x) => x.report);
    expect(provider.calls).toBe(1);
    expect(r0!.notes).toContain("model-failed");
    expect(r1!.notes).toContain("model-failed");
    expect(r1!.wording).toMatchObject({ source: "template", calls: 1 });
  });
});

describe("completeReport: resume rules", () => {
  it("returns undefined and starts nothing when the latest report is complete, or there is none", async () => {
    const h = harness(games(20, 0.5, 29));
    expect(await completeReport(h.deps(), TRACK)).toBeUndefined();
    await runReport(h.deps(), opts());
    h.starts = 0;
    expect(await completeReport(h.deps(), TRACK)).toBeUndefined();
    expect(h.starts).toBe(0);
  });

  it("never starts the engine when nothing is pending", async () => {
    const { h, r0 } = await provisional();
    // The remaining games were analysed elsewhere, at the report's settings.
    const pre = stubEvaluator();
    const byId = await h.store.gamesById(r0.gameIds);
    const done = await h.store.analysedIds(r0.gameIds, { analysisVersion: r0.settings.analysisVersion, depth: 12 });
    for (const g of byId.values()) if (!done.has(g.id)) await h.store.putAnalysis(await analyzeGame(pre, g, { depth: 12 }));

    const r1 = (await completeReport(h.deps(), TRACK))!;
    expect(h.starts).toBe(0);
    expect(r1).toMatchObject({ revision: 1, coverage: { analysed: 400, complete: true } });
  });

  it("rebuilds the period at new settings on a resume with another depth, noting settings-changed", async () => {
    const { h } = await provisional();
    const p = recorder();
    const out = await runReport(h.deps({ onProgress: p.onProgress }), opts({ depth: 14 }));
    expect(out.status).toBe("resumed");
    const r1 = out.report!;
    expect(r1.settings.engine.depth).toBe(14);
    expect(r1.notes).toContain("settings-changed");
    expect(r1.coverage).toMatchObject({ analysed: 400, total: 400, complete: true });
    // Every game, the 150 sampled at depth 12 included, is analysed again at depth 14.
    expect(p.full()[0]).toMatchObject({ total: 400 });
    expect(h.evaluator.positions).toBe(400 * POSITIONS_PER_GAME);
  });

  it("rebuilds the period when the engine build changed since revision 0", async () => {
    const { h } = await provisional();
    h.evaluator = stubEvaluator("stub-engine-2");
    const r1 = (await completeReport(h.deps(), TRACK))!;
    expect(r1.settings.engine.name).toBe("stub-engine-2");
    expect(r1.notes).toContain("settings-changed");
    expect(h.evaluator.positions).toBe(400 * POSITIONS_PER_GAME);
  });

  it("finishes an unfinished period before building the next one", async () => {
    const { h, r0 } = await provisional();
    h.available.push(...games(12, 0.5, 6.5, { asOf: WEEK_LATER }));
    const out = await runReport(h.deps(), opts({ asOf: WEEK_LATER }));
    expect(h.reported.map((x) => [x.report.periodEnd, x.report.revision])).toEqual([
      [r0.periodEnd, 1],
      [WEEK_LATER, 0],
    ]);
    const reports = await h.store.reports(TRACK);
    expect(reports.map((r) => [r.revision, r.coverage.complete])).toEqual([
      [1, true],
      [0, true],
    ]);
    // The new report builds on the completed one: its focus items are kept.
    expect(out.report!.focus.length).toBeGreaterThan(0);
    expect(out.report!.focus.every((f) => f.reason.kind === "kept")).toBe(true);
  });

  it("a provisional revision does not count in the focus rules", async () => {
    /** First report A (final), an aborted provisional B, and a report P between them. */
    async function scenario(pFinal: boolean) {
      const h = harness(games(20, 0.5, 29));
      const a = (await runReport(h.deps(), opts())).report!;
      expect(a.focus.length).toBeGreaterThan(0);
      h.available.push(...games(200, 0.5, 6.5, { asOf: WEEK_LATER }));
      await expect(runReport(h.deps(abortAfter(0)), opts({ asOf: WEEK_LATER }))).rejects.toThrow(AnalysisAborted);
      const mid = new Date(Date.parse(AS_OF) + 3 * DAY).toISOString();
      // P held nothing and retired A's items: were it final, A's items could not be kept.
      const p: WeeklyReport = {
        ...a,
        periodStart: AS_OF,
        periodEnd: mid,
        gameIds: [],
        focus: [],
        retired: a.focus.map((f) => ({ patternId: f.patternId, why: "graduated" as const, since: f.since, baseline: f.baseline, current: f.baseline })),
        coverage: { ...a.coverage, complete: pFinal, sampleOnly: false },
      };
      // P overlaps B, so the store would refuse it; it goes straight into B's history instead.
      const r0 = (await h.store.latestReport(TRACK))!;
      await completeReport(h.deps(), TRACK); // analyse B's games
      const { draft: b } = await buildDraft({
        store: h.store,
        track: TRACK,
        kind: r0.kind,
        revision: 1,
        periodStart: r0.periodStart,
        periodEnd: r0.periodEnd,
        periodIds: r0.gameIds,
        total: r0.coverage.total,
        settings: r0.settings,
        history: [a, WeeklyReport.parse(p)],
        sampleOnly: false,
        notes: [],
      });
      expect(b).toMatchObject({ periodEnd: WEEK_LATER, coverage: { complete: true } });
      return { a, b };
    }

    const ignored = await scenario(false);
    expect(ignored.b.focus.map((f) => [f.patternId, f.reason.kind])).toEqual(
      ignored.a.focus.map((f) => [f.patternId, "kept"]),
    );
    expect(ignored.b.focus.map((f) => f.since)).toEqual(ignored.a.focus.map((f) => f.since));

    const counted = await scenario(true);
    expect(counted.b.focus.some((f) => f.reason.kind === "kept")).toBe(false);
    for (const id of counted.a.focus.map((f) => f.patternId)) {
      expect(counted.b.focus.map((f) => f.patternId)).not.toContain(id);
    }
  });
});

describe("runReport: other tracks", () => {
  it("names the player's other tracks", async () => {
    const h = harness([...games(15, 1, 29), ...games(12, 1, 29, { timeClass: "rapid" })]);
    const blitz = await runReport(h.deps(), opts());
    expect(blitz.otherTracks).toBeUndefined();
    const rapid = await runReport(h.deps(), opts({ timeClass: "rapid" }));
    expect(rapid.report!.track.timeClass).toBe("rapid");
    expect(rapid.otherTracks).toEqual([TRACK]);
  });
});

const TWO_WEEKS_LATER = "2026-12-03T12:00:00.000Z";

describe("few-games weeks", () => {
  it("carry the focus items forward unchanged, so the next full week keeps them", async () => {
    const h = harness(games(20, 0.5, 29));
    const provider = wordingProvider();
    const a = (await runReport(h.deps({ provider }), opts())).report!;
    expect(a.focus.length).toBeGreaterThan(0);
    expect(a.wording.source).toBe("model");

    h.available.push(...games(3, 0.5, 6.5, { asOf: WEEK_LATER }));
    const b = (await runReport(h.deps({ provider }), opts({ asOf: WEEK_LATER, force: true }))).report!;
    expect(b.notes).toContain("few-games");
    expect(provider.calls).toBe(1);
    expect(b.retired).toEqual([]);
    expect(b.focus.map((f) => [f.patternId, f.reason.kind, f.since, f.target])).toEqual(
      a.focus.map((f) => [f.patternId, "kept", f.since, f.target]),
    );
    expect(b.focus.map((f) => f.baseline)).toEqual(a.focus.map((f) => f.baseline));
    expect(b.focus.map((f) => [f.title, f.why, f.drill])).toEqual(a.focus.map((f) => [f.title, f.why, f.drill]));
    expect(b.wording).toMatchObject({ source: "model", calls: 0, wordedFor: a.wording.wordedFor });
    expect(b.progress.map((p) => [p.patternId, p.verdict])).toEqual(a.focus.map((f) => [f.patternId, "insufficient-data"]));
    expect(() => WeeklyReport.parse(b)).not.toThrow();

    h.available.push(...games(12, 0.5, 6.5, { asOf: TWO_WEEKS_LATER }));
    const c = (await runReport(h.deps({ provider }), opts({ asOf: TWO_WEEKS_LATER }))).report!;
    expect(c.notes).not.toContain("few-games");
    for (const item of a.focus) {
      const kept = c.focus.find((f) => f.patternId === item.patternId)!;
      expect(kept).toMatchObject({ since: item.since, baseline: item.baseline, target: item.target, reason: { kind: "kept" } });
    }
  });

  it("a first report under 10 games still has no focus", async () => {
    const h = harness(games(7, 1, 20));
    expect((await runReport(h.deps(), opts())).report!.focus).toEqual([]);
  });
});

describe("unfinished reports of earlier periods", () => {
  it("a --sample-only run first completes an aborted report, then builds its own period", async () => {
    const { h, r0 } = await provisional(400);
    h.available.push(...games(200, 0.5, 6.5, { asOf: WEEK_LATER }));
    const out = await runReport(h.deps(), opts({ asOf: WEEK_LATER, sampleOnly: true }));
    const reports = await h.store.reports(TRACK);
    expect(reports.map((r) => [r.periodEnd, r.revision, r.coverage.complete, r.coverage.sampleOnly])).toEqual([
      [r0.periodEnd, 1, true, false],
      [WEEK_LATER, 0, false, true],
    ]);
    expect(out.report).toMatchObject({ periodEnd: WEEK_LATER, coverage: { sampleOnly: true } });
  });

  it("completes a provisional report that is not the latest, oldest first", async () => {
    const { h, r0 } = await provisional(400);
    // A later, finished period stored over it (as an older version of this code could leave it).
    const later: WeeklyReport = {
      ...r0,
      kind: "weekly",
      periodStart: r0.periodEnd,
      periodEnd: WEEK_LATER,
      gameIds: [],
      coverage: { sampled: 0, analysed: 0, total: 0, complete: true, sampleOnly: false },
    };
    expect(await h.store.putReport(later)).toBe("stored");
    expect(await completeReport(h.deps(), TRACK)).toBeUndefined(); // the latest is complete
    const done = (await completeReport(h.deps(), TRACK, { periodEnd: r0.periodEnd }))!;
    expect(done).toMatchObject({ periodEnd: r0.periodEnd, revision: 1, coverage: { complete: true } });

    // A run does the same on its own.
    const again = await provisional(400);
    await again.h.store.putReport({ ...later, track: TRACK });
    const out = await runReport(again.h.deps(), opts({ asOf: TWO_WEEKS_LATER }));
    expect(out.status).toBe("resumed");
    expect(out.report!.periodEnd).toBe(WEEK_LATER);
    const first = (await again.h.store.reports(TRACK))[0]!;
    expect(first).toMatchObject({ revision: 1, coverage: { complete: true } });
  });
});

describe("another run storing first", () => {
  /** Wraps the harness store so storing a report of `fromRevision` or later returns `result`. */
  function racing(h: Harness, result: "stale" | "conflict", fromRevision: number, winner = true) {
    const base = h.store;
    const store: Store = {
      ...base,
      async putReport(r) {
        if (r.revision < fromRevision) return base.putReport(r);
        if (winner && r.revision === 0) await base.putReport({ ...r, summary: "Stored by the other run." });
        return result;
      },
    };
    h.store = store;
  }

  for (const result of ["stale", "conflict"] as const) {
    it(`on "${result}" in the first pass: no rows, no onReport, no warning, lostRace and the stored report`, async () => {
      const h = harness(games(20, 0.5, 29));
      racing(h, result, 0);
      const warnings: string[] = [];
      const out = await runReport(h.deps({ onWarning: (m) => warnings.push(m) }), opts());
      expect(out).toMatchObject({ status: "unchanged", lostRace: true });
      expect(out.report!.summary).toBe("Stored by the other run.");
      expect(warnings).toEqual([]);
      expect(h.reported).toEqual([]);
      expect(await h.store.listPeriodStats(trackKey(TRACK), settingsKey(out.report!.settings))).toEqual([]);
    });

    it(`on "${result}" when completing: no rows, no onReport for it, no warning, lostRace`, async () => {
      const h = harness(games(400, 0.5, 29));
      racing(h, result, 1, false);
      const warnings: string[] = [];
      const out = await runReport(h.deps({ onWarning: (m) => warnings.push(m) }), opts());
      expect(out).toMatchObject({ status: "unchanged", lostRace: true });
      expect(out.report).toMatchObject({ revision: 0 });
      expect(warnings).toEqual([]);
      expect(h.reported.map((x) => x.report.revision)).toEqual([0]);
      expect(await h.store.listPeriodStats(trackKey(TRACK), settingsKey(out.report!.settings))).toEqual([]);
    });
  }
});

describe("games cut by --max-games", () => {
  it("are never analysed later: a 20-game week after a capped 400 analyses only the 20", async () => {
    const h = harness(games(400, 0.5, 29));
    const first = (await runReport(h.deps(), opts({ maxGames: 200 }))).report!;
    expect(first.coverage).toMatchObject({ total: 200, complete: true });
    h.evaluator.positions = 0;
    h.available.push(...games(20, 0.5, 6.5, { asOf: WEEK_LATER }));
    const next = (await runReport(h.deps(), opts({ asOf: WEEK_LATER }))).report!;
    expect(h.evaluator.positions).toBe(20 * POSITIONS_PER_GAME);
    expect(next.coverage).toMatchObject({ total: 20, complete: true });
    expect(next.comparison!.games).toBe(200);
    expect(next.weeks.reduce((n, w) => n + w.games, 0)).toBe(220);
  });
});

describe("games before the track's first period", () => {
  it("are never analysed or counted by later reports", async () => {
    const period = games(30, 0.5, 29.5);
    const older = games(10, 31, 41);
    const h = harness([...period, ...older]);
    const first = (await runReport(h.deps(), opts())).report!;
    h.evaluator.positions = 0;
    h.available.push(...games(12, 0.5, 6.5, { asOf: WEEK_LATER }));
    const next = (await runReport(h.deps(), opts({ asOf: WEEK_LATER }))).report!;
    expect(h.evaluator.positions).toBe(12 * POSITIONS_PER_GAME);
    const analysed = await h.store.analysedIds(
      older.map((g) => g.id),
      { analysisVersion: first.settings.analysisVersion, depth: 12 },
    );
    expect(analysed.size).toBe(0);
    expect(next.weeks.reduce((n, w) => n + w.games, 0)).toBe(42);
    expect(next.comparison!.games).toBe(30);
  });
});
