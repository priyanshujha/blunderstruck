import { describe, expect, it } from "vitest";
import { blindSpotSpan, inSpan } from "./assemble";
import { runReport } from "./run";
import { AS_OF, DAY, game, games, harness, opts, WEEK_LATER } from "./test-helpers";

const iso = (t: number) => new Date(t).toISOString();

describe("blindSpotSpan", () => {
  it("is the period when it starts more than six weeks before its end", () => {
    expect(blindSpotSpan("2026-09-02T12:00:00.000Z", AS_OF)).toEqual({ start: "2026-09-02T12:00:00.000Z", end: AS_OF });
  });

  it("is the six weeks for a one-week period", () => {
    expect(blindSpotSpan(AS_OF, WEEK_LATER)).toEqual({ start: iso(Date.parse(WEEK_LATER) - 42 * DAY), end: WEEK_LATER });
  });

  it("inSpan keeps the games played in it, both ends included", () => {
    const span = { start: iso(Date.parse(AS_OF) - 10 * DAY), end: AS_OF };
    const xs = [game(0), game(10), game(5), game(10.5)];
    expect(inSpan(xs, span)).toEqual([xs[0], xs[1], xs[2]]);
  });
});

describe("buildDraft: the blind-spot window", () => {
  it("a long first report computes blind spots over all its games and says so", async () => {
    // 20 games 20 to 80 days ago: the first report reaches back past six weeks to hold them.
    const h = harness(games(20, 20, 80));
    const r = (await runReport(h.deps(), opts())).report!;
    expect(Date.parse(r.periodStart)).toBeLessThan(Date.parse(AS_OF) - 42 * DAY);
    expect(r.focus.length).toBeGreaterThan(0);
    // The weekly rows cover only the last six weeks; the window covers the whole period.
    expect(r.weeks.reduce((n, w) => n + w.games, 0)).toBeLessThan(20);
    for (const f of r.focus) {
      expect(f.blindSpotWindow).toMatchObject({ start: r.periodStart, end: r.periodEnd, games: 20 });
    }
  });

  it("a weekly report computes blind spots over its six weeks", async () => {
    const h = harness(games(30, 1, 29));
    await runReport(h.deps(), opts());
    // Next week: 12 new games; the six weeks before WEEK_LATER also hold the 30 earlier ones.
    h.available.push(...games(12, 0.5, 6.5, { asOf: WEEK_LATER }));
    const r = (await runReport(h.deps(), opts({ asOf: WEEK_LATER }))).report!;
    expect(r.kind).toBe("weekly");
    expect(r.focus.length).toBeGreaterThan(0);
    const start = iso(Date.parse(r.periodEnd) - 42 * DAY);
    const inWindow = h.available.filter((g) => Date.parse(g.playedAt) > Date.parse(start) && Date.parse(g.playedAt) <= Date.parse(r.periodEnd));
    for (const f of r.focus) {
      expect(f.blindSpotWindow).toMatchObject({ start, end: r.periodEnd, games: inWindow.length });
    }
    expect(inWindow.length).toBe(r.weeks.reduce((n, w) => n + w.games, 0));
  });
});
