import type { GameRecord } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { selectGames } from "./select";
import { weekBuckets } from "./weeks";

const END = "2026-11-19T00:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

const game = (i: number, playedAtMs: number): GameRecord => ({
  id: `lichess:g${String(i).padStart(5, "0")}`,
  platform: "lichess",
  url: `https://lichess.org/g${i}`,
  playedAt: new Date(playedAtMs).toISOString(),
  rated: true,
  timeClass: "blitz",
  timeControl: "180+0",
  white: { name: "test-player", rating: 1500 },
  black: { name: "opponent", rating: 1500 },
  result: "draw",
  pgn: "1. e4 e5 *",
});

/** `count` games spread evenly over the `days` before `END`, newest at `END`. */
const spread = (count: number, days: number): GameRecord[] =>
  Array.from({ length: count }, (_, i) => game(i, Date.parse(END) - (i * days * DAY_MS) / count));

/** Deterministic shuffle (a small linear congruential generator). */
function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const weekOf = (g: GameRecord): number => {
  const t = Date.parse(g.playedAt);
  return weekBuckets(END, 10).findIndex((b) => Date.parse(b.start) < t && t <= Date.parse(b.end));
};

describe("selectGames", () => {
  it("takes 150 of 1,500 games over 30 days, at least 5 per week, regardless of input order", () => {
    const games = spread(1500, 30);
    const picked = selectGames(games, 150, END);
    expect(picked).toHaveLength(150);
    expect(new Set(picked.map((g) => g.id)).size).toBe(150);

    const perWeek = new Map<number, number>();
    for (const g of picked) perWeek.set(weekOf(g), (perWeek.get(weekOf(g)) ?? 0) + 1);
    expect([...perWeek.keys()].sort()).toEqual([0, 1, 2, 3, 4]);
    for (const n of perWeek.values()) expect(n).toBeGreaterThanOrEqual(5);

    const sortedIds = (gs: GameRecord[]) => gs.map((g) => g.id);
    expect(sortedIds(selectGames(shuffle(games, 7), 150, END))).toEqual(sortedIds(picked));
    expect(sortedIds(selectGames([...games].reverse(), 150, END))).toEqual(sortedIds(picked));
  });

  it("returns the result in (playedAt, id) order", () => {
    const picked = selectGames(shuffle(spread(400, 30), 3), 150, END);
    const times = picked.map((g) => Date.parse(g.playedAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("returns every game when there are 150 or fewer", () => {
    const games = spread(120, 30);
    const picked = selectGames(shuffle(games, 11), 150, END);
    expect(picked).toHaveLength(120);
    expect(new Set(picked.map((g) => g.id))).toEqual(new Set(games.map((g) => g.id)));
  });

  it("gives a week with 3 games all 3", () => {
    // 3 games in week 2, 500 in week 0.
    const sparse = [0, 1, 2].map((i) => game(10_000 + i, Date.parse(END) - (15 + i) * DAY_MS));
    const busy = Array.from({ length: 500 }, (_, i) => game(i, Date.parse(END) - (i * 6 * DAY_MS) / 500));
    const picked = selectGames([...busy, ...sparse], 150, END);
    expect(picked).toHaveLength(150);
    for (const g of sparse) expect(picked.map((p) => p.id)).toContain(g.id);
  });

  it("spreads picks evenly within a week", () => {
    // One week of 300 games; 150 picks take every other game, starting at index 1.
    const games = Array.from({ length: 300 }, (_, i) => game(i, Date.parse(END) - 6 * DAY_MS + i * 1000));
    const picked = selectGames(games, 150, END);
    const index = new Map(games.map((g, i) => [g.id, i]));
    expect(picked.map((g) => index.get(g.id))).toEqual(Array.from({ length: 150 }, (_, i) => 2 * i + 1));
  });

  it("shares the rest by largest remainder and never exceeds a week's games", () => {
    // Weeks of 100, 7 and 50 games: minimums 5 + 5 + 5, the remaining 15 shared on 95 : 2 : 45.
    const at = (week: number, n: number, base: number) =>
      Array.from({ length: n }, (_, i) => game(base + i, Date.parse(END) - week * 7 * DAY_MS - (i + 1) * 60_000));
    const games = [...at(0, 100, 0), ...at(1, 7, 1000), ...at(2, 50, 2000)];
    const picked = selectGames(games, 30, END);
    const perWeek = [0, 1, 2].map((w) => picked.filter((g) => weekOf(g) === w).length);
    // 15·95/142 = 10.03, 15·2/142 = 0.21, 15·45/142 = 4.75: floors 10, 0, 4, one left to week 2.
    expect(perWeek).toEqual([15, 5, 10]);
  });
});
