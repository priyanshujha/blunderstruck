import type { GameRecord, ReportTimeClass, Track, WeeklyReport } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { chooseTrack, pickTimeClass, planPeriod, ReportInputError, reportableGames } from "./periods";

const AS_OF = "2026-11-19T12:00:00.000Z";
const DAY = 24 * 60 * 60 * 1000;
const PLAYER = "test-pawnstorm";
const TRACK: Track = { platform: "lichess", username: PLAYER, timeClass: "blitz" };

let seq = 0;
/** A game `daysAgo` days before `AS_OF`, the player as White. */
function game(daysAgo: number, opts: { timeClass?: GameRecord["timeClass"]; rated?: boolean; id?: string } = {}): GameRecord {
  const n = seq++;
  return {
    id: opts.id ?? `lichess:p${String(n).padStart(4, "0")}`,
    platform: "lichess",
    url: `https://lichess.org/p${n}`,
    playedAt: new Date(Date.parse(AS_OF) - daysAgo * DAY).toISOString(),
    rated: opts.rated ?? true,
    timeClass: opts.timeClass ?? "blitz",
    timeControl: "180+0",
    white: { name: PLAYER, rating: 1600 },
    black: { name: "test-opponent", rating: 1600 },
    result: "draw",
    pgn: "1. e4 e5 *",
  };
}

/** `count` games evenly between `fromDays` and `toDays` ago. */
const spread = (count: number, fromDays: number, toDays: number, timeClass: ReportTimeClass = "blitz") =>
  Array.from({ length: count }, (_, i) => game(fromDays + ((toDays - fromDays) * (i + 0.5)) / count, { timeClass }));

/** The smallest stored report `planPeriod` reads: its end and the games it listed. */
const stored = (periodEnd: string, gameIds: string[], revision = 0): WeeklyReport =>
  ({ track: TRACK, periodEnd, gameIds, revision, coverage: { complete: true, sampleOnly: false } }) as unknown as WeeklyReport;

describe("pickTimeClass", () => {
  it("picks the most-played class in the last 30 days", () => {
    const games = [...spread(5, 1, 29, "rapid"), ...spread(8, 1, 29, "blitz"), ...spread(30, 40, 80, "rapid")];
    expect(pickTimeClass(games, PLAYER, AS_OF)).toBe("blitz");
  });

  it("breaks ties towards the slower class: rapid, blitz, classical, bullet", () => {
    expect(pickTimeClass([...spread(4, 1, 20, "bullet"), ...spread(4, 1, 20, "blitz")], PLAYER, AS_OF)).toBe("blitz");
    expect(pickTimeClass([...spread(4, 1, 20, "classical"), ...spread(4, 1, 20, "rapid")], PLAYER, AS_OF)).toBe("rapid");
    expect(pickTimeClass([...spread(4, 1, 20, "bullet"), ...spread(4, 1, 20, "classical")], PLAYER, AS_OF)).toBe("classical");
  });

  it("falls back to 90 days, ignores unrated, daily and future games, and gives null with none", () => {
    expect(pickTimeClass(spread(3, 40, 80, "rapid"), PLAYER, AS_OF)).toBe("rapid");
    const ignored = [game(2, { rated: false }), game(2, { timeClass: "daily" }), game(-1), game(100)];
    expect(pickTimeClass(ignored, PLAYER, AS_OF)).toBeNull();
    expect(reportableGames(ignored, PLAYER, AS_OF)).toEqual([ignored[3]]);
  });
});

describe("chooseTrack", () => {
  const blitz = { track: TRACK, latestEnd: "2026-11-12T00:00:00.000Z" };
  const rapid = { track: { ...TRACK, timeClass: "rapid" as const }, latestEnd: "2026-11-05T00:00:00.000Z" };
  const other = { track: { ...TRACK, username: "someone-else" } };

  it("uses the track with the most recent report and lists the others", () => {
    const got = chooseTrack({ platform: "lichess", username: PLAYER.toUpperCase(), tracks: [rapid, blitz, other] });
    expect(got).toEqual({ track: TRACK, isNew: false, others: [rapid.track] });
  });

  it("starts a new track for an asked-for time class, and none without one", () => {
    expect(chooseTrack({ platform: "lichess", username: PLAYER, timeClass: "bullet", tracks: [blitz] })).toMatchObject({
      track: { timeClass: "bullet" },
      isNew: true,
    });
    expect(chooseTrack({ platform: "lichess", username: PLAYER, tracks: [other] })).toBeUndefined();
  });
});

describe("planPeriod: first report", () => {
  it("takes the 30 days before asOf when they hold 20 games", () => {
    const games = [...spread(25, 0.5, 29), ...spread(10, 31, 80)];
    const p = planPeriod({ track: TRACK, reports: [], games, asOf: AS_OF, force: false });
    expect(p).toMatchObject({ status: "report", kind: "first", periodStart: "2026-10-20T12:00:00.000Z", periodEnd: AS_OF });
    if (p.status !== "report") throw new Error("expected a report");
    expect(p.gameIds).toHaveLength(25);
    expect(p.comparison).toBeNull();
    expect(p.weeks).toHaveLength(6);
    expect(p.weeks[0]).toEqual({ start: "2026-11-12T12:00:00.000Z", end: AS_OF });
  });

  it("extends to the 20th-newest game when 30 days hold only 12", () => {
    const recent = spread(12, 1, 29);
    const older = spread(15, 35, 85); // index 0 is the newest
    const p = planPeriod({ track: TRACK, reports: [], games: [...older, ...recent], asOf: AS_OF, force: false });
    if (p.status !== "report") throw new Error("expected a report");
    expect(p.gameIds).toHaveLength(20);
    expect(p.periodStart).toBe(older[7]!.playedAt);
  });

  it("uses the whole 90 days with fewer than 20 games, and only the track's class", () => {
    const games = [...spread(7, 10, 80), ...spread(5, 1, 5, "rapid"), game(95)];
    const p = planPeriod({ track: TRACK, reports: [], games, asOf: AS_OF, force: false });
    if (p.status !== "report") throw new Error("expected a report");
    expect(p.periodStart).toBe("2026-08-21T12:00:00.000Z");
    expect(p.gameIds).toHaveLength(7);
  });
});

describe("planPeriod: later reports", () => {
  const end1 = "2026-11-12T12:00:00.000Z";
  const first = spread(20, 8, 30);
  const reports = [stored(end1, first.map((g) => g.id))];

  it("is unchanged with no new games, waiting with 6 (4 more needed), and forced with --now", () => {
    expect(planPeriod({ track: TRACK, reports, games: first, asOf: AS_OF, force: false })).toMatchObject({
      status: "unchanged",
      newGames: 0,
    });
    const six = spread(6, 1, 6);
    expect(planPeriod({ track: TRACK, reports, games: [...first, ...six], asOf: AS_OF, force: false })).toMatchObject({
      status: "waiting",
      newGames: 6,
      needed: 4,
    });
    const forced = planPeriod({ track: TRACK, reports, games: [...first, ...six], asOf: AS_OF, force: true });
    expect(forced).toMatchObject({ status: "report", kind: "weekly", periodStart: end1, periodEnd: AS_OF });
    if (forced.status !== "report") throw new Error("expected a report");
    expect(forced.gameIds).toEqual(six.map((g) => g.id).reverse());
    expect(forced.comparison).toEqual({ start: "2026-10-13T12:00:00.000Z", end: end1 });
  });

  it("counts a late game once: in the first period that sees it, never again", () => {
    const late = game(7.2); // before end1, missing from the first report
    const fresh = spread(10, 1, 6);
    const p = planPeriod({ track: TRACK, reports, games: [...first, late, ...fresh], asOf: AS_OF, force: false });
    if (p.status !== "report") throw new Error("expected a report");
    expect(p.gameIds).toContain(late.id);
    expect(p.gameIds).toHaveLength(11);

    const next = [...reports, stored(AS_OF, p.gameIds)];
    const again = planPeriod({ track: TRACK, reports: next, games: [late, ...fresh], asOf: "2026-11-26T12:00:00.000Z", force: true });
    expect(again).toMatchObject({ status: "unchanged", newGames: 0 });
  });

  it("ignores games older than the fetch overlap that no report listed", () => {
    const unlisted = game(40);
    expect(planPeriod({ track: TRACK, reports, games: [...first, unlisted], asOf: AS_OF, force: true })).toMatchObject({
      status: "unchanged",
    });
  });

  it("rejects an asOf earlier than the latest report, and opens no period at the same instant", () => {
    expect(() => planPeriod({ track: TRACK, reports, games: first, asOf: "2026-11-10T00:00:00.000Z", force: false })).toThrow(
      ReportInputError,
    );
    const late = game(7.2);
    expect(planPeriod({ track: TRACK, reports, games: [late], asOf: end1, force: true })).toMatchObject({ status: "unchanged" });
  });
});
