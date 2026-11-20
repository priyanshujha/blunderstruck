import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AnalysisSettings,
  AnalyzedGame,
  GameRecord,
  PeriodStats,
  Track,
  WeeklyReport,
} from "@blunderstruck/contracts";
import type { Store } from "./store";

// Invented players and games only.

export const SETTINGS: AnalysisSettings = {
  analysisVersion: 2,
  patternsVersion: 1,
  engine: { name: "stockfish", depth: 12 },
};

export const TRACK: Track = { platform: "lichess", username: "TestPlayer", timeClass: "blitz" };

export function fixtureGame(n: number, over: Partial<GameRecord> = {}): GameRecord {
  const id = over.id ?? `lichess:g${String(n).padStart(4, "0")}`;
  return {
    id,
    platform: "lichess",
    url: `https://lichess.org/${id.split(":")[1] ?? "x"}`,
    playedAt: new Date(Date.UTC(2026, 10, 1) + n * 3_600_000).toISOString(),
    rated: true,
    timeClass: "blitz",
    timeControl: "180+2",
    white: { name: "TestPlayer", rating: 1650 },
    black: { name: `Opponent${n}`, rating: 1640 },
    result: "white",
    termination: "resign",
    opening: { eco: "C20", name: "King's Pawn Game" },
    pgn: "1. e4 e5 *",
    ...over,
  };
}

export function fixtureAnalysis(gameId: string, over: Partial<AnalyzedGame> = {}): AnalyzedGame {
  return {
    gameId,
    analysisVersion: 2,
    engine: { name: "stockfish", depth: 12 },
    moves: [
      {
        ply: 1,
        color: "white",
        san: "e4",
        uci: "e2e4",
        fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        bestUci: "e2e4",
        bestLine: ["e2e4", "e7e5"],
        scoreBefore: { cp: 20 },
        scoreAfter: { cp: 25 },
        winPctBefore: 51.8,
        winPctAfter: 52.3,
        winPctLoss: 0,
        judgment: "ok",
      },
    ],
    ...over,
  };
}

export function fixturePeriodStats(start: string, end: string, games = 10): PeriodStats {
  return {
    start,
    end,
    games,
    moves: games * 35,
    mistakesPer100Moves: 3.25,
    settings: SETTINGS,
    stats: [
      {
        patternId: "hung-piece",
        games,
        moves: games * 35,
        gamesAffected: 2,
        occurrences: 3,
        per100Moves: 0.86,
        avgWinPctLoss: 28,
      },
    ],
  };
}

const DAY = 86_400_000;

export function fixtureReport(periodEnd: string, revision = 0, track: Track = TRACK): WeeklyReport {
  const endMs = Date.parse(periodEnd);
  const iso = (ms: number) => new Date(ms).toISOString();
  const current = fixturePeriodStats(iso(endMs - 7 * DAY), iso(endMs));
  return {
    player: track.username,
    track,
    kind: "weekly",
    revision,
    periodStart: current.start,
    periodEnd,
    rating: 1650,
    band: "club",
    bandSource: "ratings",
    settings: SETTINGS,
    gamesFound: 10,
    gamesAnalyzed: 10,
    gameIds: ["lichess:g0001"],
    coverage: { sampled: 10, analysed: 10, total: 10, complete: true, sampleOnly: false },
    current,
    comparison: null,
    weeks: Array.from({ length: 6 }, (_, i) =>
      fixturePeriodStats(iso(endMs - (i + 1) * 7 * DAY), iso(endMs - i * 7 * DAY)),
    ),
    trends: [],
    priorities: [],
    focus: [],
    progress: [],
    retired: [],
    summary: "{games} games, {focusCount} things to work on.",
    wording: { source: "template", wordedFor: [], calls: 0 },
    notes: ["no-key"],
  };
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

/** Behaviour every `Store` must have; run it against each implementation. */
export function storeConformance(make: () => Promise<Store>): void {
  let store: Store;

  beforeEach(async () => {
    store = await make();
  });
  afterEach(async () => {
    await store.close();
  });

  describe("tracks", () => {
    it("lists tracks by key and keeps the earliest createdAt", async () => {
      const rapid: Track = { ...TRACK, timeClass: "rapid" };
      await store.putTrack(rapid, "2026-11-10T00:00:00.000Z");
      await store.putTrack(TRACK, "2026-11-12T00:00:00.000Z");
      await store.putTrack(TRACK, "2026-11-14T00:00:00.000Z");
      await store.putTrack(TRACK, "2026-11-11T00:00:00.000Z");
      expect(await store.tracks()).toEqual([
        { ...TRACK, createdAt: "2026-11-11T00:00:00.000Z" },
        { ...rapid, createdAt: "2026-11-10T00:00:00.000Z" },
      ]);
    });

    it("treats usernames that differ only in case as one track", async () => {
      await store.putTrack(TRACK, "2026-11-12T00:00:00.000Z");
      await store.putTrack({ ...TRACK, username: "testplayer" }, "2026-11-13T00:00:00.000Z");
      expect(await store.tracks()).toHaveLength(1);
    });
  });

  describe("games", () => {
    it("upserts by id", async () => {
      await store.putGames([fixtureGame(1)]);
      await store.putGames([fixtureGame(1, { result: "draw" })]);
      const all = await collect(store.allGames());
      expect(all).toHaveLength(1);
      expect(all[0]?.result).toBe("draw");
    });

    it("finds the player's games in either seat, case-insensitively, sorted by (playedAt, id)", async () => {
      const same = "2026-11-03T00:00:00.000Z";
      await store.putGames([
        fixtureGame(3, { id: "lichess:b", playedAt: same }),
        fixtureGame(4, { id: "lichess:a", playedAt: same }),
        fixtureGame(1, { white: { name: "Someone" }, black: { name: "testplayer" } }),
        fixtureGame(2, { white: { name: "Someone" }, black: { name: "Else" } }),
        fixtureGame(5, { platform: "chesscom", id: "chesscom:5" }),
      ]);
      const got = await store.games({ platform: "lichess", username: "TESTPLAYER" });
      expect(got.map((g) => g.id)).toEqual(["lichess:g0001", "lichess:a", "lichess:b"]);
    });

    it("filters by time class, from inclusive and to exclusive", async () => {
      await store.putGames([
        fixtureGame(1, { playedAt: "2026-11-01T00:00:00.000Z" }),
        fixtureGame(2, { playedAt: "2026-11-02T00:00:00.000Z" }),
        fixtureGame(3, { playedAt: "2026-11-03T00:00:00.000Z" }),
        fixtureGame(4, { playedAt: "2026-11-02T12:00:00.000Z", timeClass: "rapid" }),
      ]);
      const got = await store.games({
        platform: "lichess",
        username: "TestPlayer",
        timeClass: "blitz",
        from: "2026-11-02T00:00:00Z",
        to: "2026-11-03T00:00:00Z",
      });
      expect(got.map((g) => g.id)).toEqual(["lichess:g0002"]);
      const any = await store.games({ platform: "lichess", username: "TestPlayer", from: "2026-11-02T00:00:00Z" });
      expect(any.map((g) => g.id)).toEqual(["lichess:g0002", "lichess:g0004", "lichess:g0003"]);
    });

    it("returns only the ids it holds from gamesById", async () => {
      await store.putGames([fixtureGame(1), fixtureGame(2)]);
      const got = await store.gamesById(["lichess:g0002", "lichess:missing"]);
      expect([...got.keys()]).toEqual(["lichess:g0002"]);
      expect(got.get("lichess:g0002")).toEqual(fixtureGame(2));
    });

    it("hands back copies, not its own objects", async () => {
      await store.putGames([fixtureGame(1)]);
      const [g] = await store.games({ platform: "lichess", username: "TestPlayer" });
      if (g) g.result = "black";
      const again = await store.gamesById(["lichess:g0001"]);
      expect(again.get("lichess:g0001")?.result).toBe("white");
    });

    it("streams every game ordered by id", async () => {
      await store.putGames([fixtureGame(3), fixtureGame(1), fixtureGame(2)]);
      expect((await collect(store.allGames())).map((g) => g.id)).toEqual([
        "lichess:g0001",
        "lichess:g0002",
        "lichess:g0003",
      ]);
    });
  });

  describe("analyses", () => {
    beforeEach(async () => {
      await store.putGames([fixtureGame(1), fixtureGame(2), fixtureGame(3)]);
    });

    it("rejects an analysis of a game it does not hold", async () => {
      await expect(store.putAnalysis(fixtureAnalysis("lichess:missing"))).rejects.toThrow();
    });

    it("matches on analysis version and depth, and on engine name when given", async () => {
      await store.putAnalysis(fixtureAnalysis("lichess:g0001"));
      await store.putAnalysis(fixtureAnalysis("lichess:g0002", { engine: { name: "other", depth: 12 } }));
      await store.putAnalysis(fixtureAnalysis("lichess:g0003", { analysisVersion: 1 }));
      const ids = ["lichess:g0001", "lichess:g0002", "lichess:g0003"];

      const any = await store.getAnalyses(ids, { analysisVersion: 2, depth: 12 });
      expect([...any.keys()].sort()).toEqual(["lichess:g0001", "lichess:g0002"]);
      expect(any.get("lichess:g0001")).toEqual(fixtureAnalysis("lichess:g0001"));

      const sf = await store.analysedIds(ids, { analysisVersion: 2, depth: 12, engineName: "stockfish" });
      expect([...sf]).toEqual(["lichess:g0001"]);
      expect((await store.analysedIds(ids, { analysisVersion: 2, depth: 20 })).size).toBe(0);
    });

    it("upserts by game, version, depth and engine", async () => {
      await store.putAnalysis(fixtureAnalysis("lichess:g0001"));
      await store.putAnalysis(fixtureAnalysis("lichess:g0001", { moves: [] }));
      await store.putAnalysis(fixtureAnalysis("lichess:g0001", { engine: { name: "stockfish", depth: 16 } }));
      const all = await collect(store.allAnalyses());
      expect(all.map((a) => [a.gameId, a.engine.depth, a.moves.length])).toEqual([
        ["lichess:g0001", 12, 0],
        ["lichess:g0001", 16, 1],
      ]);
    });

    it("streams analyses ordered by game, version, depth and engine", async () => {
      await store.putAnalysis(fixtureAnalysis("lichess:g0002"));
      await store.putAnalysis(fixtureAnalysis("lichess:g0001", { engine: { name: "zeta", depth: 12 } }));
      await store.putAnalysis(fixtureAnalysis("lichess:g0001", { analysisVersion: 1 }));
      await store.putAnalysis(fixtureAnalysis("lichess:g0001"));
      const keys = (await collect(store.allAnalyses())).map(
        (a) => `${a.gameId}/${a.analysisVersion}/${a.engine.depth}/${a.engine.name}`,
      );
      expect(keys).toEqual([
        "lichess:g0001/1/12/stockfish",
        "lichess:g0001/2/12/stockfish",
        "lichess:g0001/2/12/zeta",
        "lichess:g0002/2/12/stockfish",
      ]);
    });
  });

  describe("period stats", () => {
    it("stores one row per track, period end and settings key", async () => {
      const a = fixturePeriodStats("2026-11-05T00:00:00.000Z", "2026-11-12T00:00:00.000Z");
      const b = fixturePeriodStats("2026-11-12T00:00:00.000Z", "2026-11-19T00:00:00.000Z");
      await store.putPeriodStats("lichess:testplayer:blitz", "k1", a);
      await store.putPeriodStats("lichess:testplayer:blitz", "k1", b);
      await store.putPeriodStats("lichess:testplayer:blitz", "k1", { ...b, games: 20 });
      await store.putPeriodStats("lichess:testplayer:blitz", "k2", a);
      await store.putPeriodStats("lichess:testplayer:rapid", "k1", a);

      const ends = ["2026-11-12T00:00:00.000Z", "2026-11-19T00:00:00.000Z", "2026-11-26T00:00:00.000Z"];
      const got = await store.getPeriodStats("lichess:testplayer:blitz", "k1", ends);
      expect([...got.keys()]).toEqual(ends.slice(0, 2));
      expect(got.get(ends[0] ?? "")).toEqual(a);
      expect(got.get(ends[1] ?? "")?.games).toBe(20);
    });

    it("lists every week for one track and settings key, end ascending", async () => {
      const tk = "lichess:testplayer:blitz";
      const w1 = fixturePeriodStats("2026-11-05T00:00:00.000Z", "2026-11-12T00:00:00.000Z");
      const w2 = fixturePeriodStats("2026-11-12T00:00:00.000Z", "2026-11-19T00:00:00.000Z");
      const w0 = fixturePeriodStats("2026-10-29T00:00:00.000Z", "2026-11-05T00:00:00.000Z");
      await store.putPeriodStats(tk, "k1", w2);
      await store.putPeriodStats(tk, "k1", w0);
      await store.putPeriodStats(tk, "k1", w1);
      await store.putPeriodStats(tk, "k1.x", w1);
      await store.putPeriodStats(tk, "k2", w1);
      await store.putPeriodStats("lichess:testplayer:rapid", "k1", w1);
      expect(await store.listPeriodStats(tk, "k1")).toEqual([w0, w1, w2]);
      expect(await store.listPeriodStats(tk, "missing")).toEqual([]);
    });
  });

  describe("reports", () => {
    it("stores a higher revision and calls an equal or lower one stale", async () => {
      const end = "2026-11-19T00:00:00.000Z";
      expect(await store.putReport(fixtureReport(end, 1))).toBe("stored");
      expect(await store.putReport(fixtureReport(end, 1))).toBe("stale");
      expect(await store.putReport(fixtureReport(end, 0))).toBe("stale");
      expect(await store.putReport(fixtureReport(end, 2))).toBe("stored");
      const all = await store.reports(TRACK);
      expect(all.map((r) => r.revision)).toEqual([2]);
    });

    it("lists a track's reports by period end and returns the latest", async () => {
      const other: Track = { ...TRACK, timeClass: "rapid" };
      await store.putReport(fixtureReport("2026-11-19T00:00:00.000Z"));
      await store.putReport(fixtureReport("2026-11-05T00:00:00.000Z"));
      await store.putReport(fixtureReport("2026-11-12T00:00:00.000Z"));
      await store.putReport(fixtureReport("2026-11-26T00:00:00.000Z", 0, other));

      const ends = (await store.reports({ ...TRACK, username: "testplayer" })).map((r) => r.periodEnd);
      expect(ends).toEqual(["2026-11-05T00:00:00.000Z", "2026-11-12T00:00:00.000Z", "2026-11-19T00:00:00.000Z"]);
      expect((await store.latestReport(TRACK))?.periodEnd).toBe("2026-11-19T00:00:00.000Z");
      expect(await store.latestReport({ ...TRACK, timeClass: "classical" })).toBeUndefined();
      expect(await store.reports(other)).toEqual([fixtureReport("2026-11-26T00:00:00.000Z", 0, other)]);
    });
  });

  describe("validation", () => {
    it("refuses records that do not match their contract", async () => {
      await expect(store.putGames([{ ...fixtureGame(1), pgn: "" }])).rejects.toThrow();
      await expect(store.putReport({ ...fixtureReport("2026-11-19T00:00:00.000Z"), revision: -1 })).rejects.toThrow();
      expect(await collect(store.allGames())).toEqual([]);
    });
  });
}
