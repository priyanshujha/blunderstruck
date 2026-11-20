import { clockBefore, playerMoves } from "../game";
import { isCountable, timeTroubleThreshold } from "../rules";
import type { DetectorHit, GameDetector } from "../types";

/**
 * `time-trouble`: a countable move made with less than `timeTroubleThreshold(clock)` seconds
 * on the clock before it (the player's clock after their previous move, or the base time for
 * their first). Daily games, games without a time control and games whose PGN carries no
 * `%clk` are skipped.
 */
export const timeTrouble: GameDetector = {
  id: "time-trouble",
  scope: "game",
  family: "context",
  detect(g) {
    if (!g.clock) return [];
    if (!g.analysis.moves.some((m) => m.clockSeconds !== undefined)) return [];
    const threshold = timeTroubleThreshold(g.clock);
    const hits: DetectorHit[] = [];
    for (const m of playerMoves(g)) {
      if (!isCountable(m)) continue;
      const left = clockBefore(g, m);
      if (left === undefined || left >= threshold) continue;
      hits.push({
        gameId: g.analysis.gameId,
        ply: m.ply,
        winPctLoss: m.winPctLoss,
        evidence: `${m.judgment} with ${Math.floor(left)} s left`,
      });
    }
    return hits;
  },
};
