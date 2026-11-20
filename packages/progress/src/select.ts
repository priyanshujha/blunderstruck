import type { GameRecord } from "@blunderstruck/contracts";
import { SAMPLE_MIN_PER_BUCKET, WEEK_DAYS } from "./rules";

const WEEK_MS = WEEK_DAYS * 24 * 60 * 60 * 1000;

const byPlayedAtThenId = (a: GameRecord, b: GameRecord): number => {
  const ta = Date.parse(a.playedAt);
  const tb = Date.parse(b.playedAt);
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * Pick at most `cap` games spread evenly over the 7-day weeks ending at `end`. The result
 * does not depend on the order of `games`; `cap` games or fewer are all returned.
 *
 * Games are sorted by `(playedAt, id)` and put in the weeks `(end - 7(a+1) d, end - 7a d]`
 * (a game after `end` counts in week 0; the oldest week may be partial). Each week first gets
 * `min(SAMPLE_MIN_PER_BUCKET, size)` games, newest weeks first if `cap` cannot cover that. The
 * rest of `cap` is shared in proportion to the games each week still has, by largest
 * remainder, ties to the newer week. Within a week of `n` games, `q` picks take indices
 * `floor((i + 0.5) n / q)`. The result is in `(playedAt, id)` order.
 */
export function selectGames(games: readonly GameRecord[], cap: number, end: string): GameRecord[] {
  const sorted = [...games].sort(byPlayedAtThenId);
  if (sorted.length <= cap) return sorted;
  if (cap <= 0) return [];

  const endMs = Date.parse(end);
  if (Number.isNaN(endMs)) throw new Error(`selectGames: not a date: ${end}`);

  // buckets[a] holds week a's games (0 is the newest), each in (playedAt, id) order.
  const buckets: GameRecord[][] = [];
  for (const g of sorted) {
    const age = endMs - Date.parse(g.playedAt);
    const a = age <= 0 ? 0 : Math.ceil(age / WEEK_MS) - 1;
    while (buckets.length <= a) buckets.push([]);
    buckets[a]!.push(g);
  }

  // Minimum per week, newest first.
  let left = cap;
  const quota = buckets.map((b) => {
    const q = Math.min(SAMPLE_MIN_PER_BUCKET, b.length, left);
    left -= q;
    return q;
  });

  // Share the rest by largest remainder, in exact integer arithmetic.
  if (left > 0) {
    const spare = buckets.map((b, a) => b.length - quota[a]!);
    const total = spare.reduce((s, x) => s + x, 0);
    const remainders: { a: number; r: number }[] = [];
    let given = 0;
    spare.forEach((w, a) => {
      const share = Math.floor((left * w) / total);
      quota[a]! += share;
      given += share;
      remainders.push({ a, r: (left * w) % total });
    });
    remainders.sort((x, y) => y.r - x.r || x.a - y.a);
    for (let i = 0; i < left - given; i++) quota[remainders[i]!.a]! += 1;
  }

  const picked: GameRecord[] = [];
  buckets.forEach((b, a) => {
    const q = quota[a]!;
    const n = b.length;
    for (let i = 0; i < q; i++) picked.push(b[Math.floor(((2 * i + 1) * n) / (2 * q))]!);
  });
  return picked.sort(byPlayedAtThenId);
}
