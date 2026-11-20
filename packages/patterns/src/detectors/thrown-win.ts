import type { AnalyzedMove } from "@blunderstruck/contracts";
import { moveLabel } from "../board";
import { lostOnTime, playerMoves } from "../game";
import { THROWN_WIN_FLOOR, THROWN_WIN_PEAK } from "../rules";
import type { GameDetector, PlayerGame } from "../types";

/** The player's win% in the final analysed position. */
function finalWinPct(g: PlayerGame): number | undefined {
  const last = g.analysis.moves[g.analysis.moves.length - 1];
  if (!last) return undefined;
  return last.color === g.color ? last.winPctAfter : 100 - last.winPctAfter;
}

/**
 * `thrown-win`: the player reached `THROWN_WIN_PEAK` win% (before one of their own moves) and
 * did not win, and from that move on some move of theirs left them below `THROWN_WIN_FLOOR`.
 * At most one per game, on the biggest drop from the first time the peak was reached. A game
 * lost on time while the final position still gave the player at least `THROWN_WIN_FLOOR`
 * win% is not counted: the clock lost it, not the board.
 */
export const thrownWin: GameDetector = {
  id: "thrown-win",
  scope: "game",
  family: "context",
  detect(g) {
    if (g.outcome === "win") return [];
    if (lostOnTime(g) && (finalWinPct(g) ?? 0) >= THROWN_WIN_FLOOR) return [];
    const own = playerMoves(g);
    const start = own.findIndex((m) => m.winPctBefore >= THROWN_WIN_PEAK);
    if (start === -1) return [];
    const after = own.slice(start);
    if (!after.some((m) => m.winPctAfter < THROWN_WIN_FLOOR)) return [];
    let drop: AnalyzedMove = after[0]!;
    for (const m of after) if (m.winPctLoss > drop.winPctLoss) drop = m;
    // The best position the player had on the way to that drop.
    let peak: AnalyzedMove = after[0]!;
    for (const m of after) {
      if (m.ply > drop.ply) break;
      if (m.winPctBefore > peak.winPctBefore) peak = m;
    }
    const result = g.outcome === "draw" ? "drawn" : "lost";
    return [
      {
        gameId: g.analysis.gameId,
        ply: drop.ply,
        winPctLoss: drop.winPctLoss,
        evidence: `won position (${Math.round(peak.winPctBefore)}%) at move ${Math.ceil(peak.ply / 2)}, game ${result}; biggest drop ${moveLabel(drop)}`,
      },
    ];
  },
};
