import type { GameRecord } from "@blunderstruck/contracts";

/**
 * Pick at most `cap` games spread evenly over the 7-day weeks ending at `end`. The result
 * does not depend on the order of `games`; `cap` games or fewer are all returned.
 */
export function selectGames(games: readonly GameRecord[], cap: number, end: string): GameRecord[] {
  throw new Error("not implemented");
}
