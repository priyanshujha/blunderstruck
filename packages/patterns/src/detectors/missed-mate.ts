import { uciToSan } from "../board";
import { mateFor, playerMoves } from "../game";
import { MATE_HORIZON } from "../rules";
import type { DetectorHit, GameDetector } from "../types";

/**
 * `missed-mate`: before the move the player had mate in `MATE_HORIZON` or fewer; the move did
 * not mate and the score after it is not a mate for the player (a slower mate kept is fine).
 * The winning-anyway rule does not apply: a missed mate counts even when the player stays
 * clearly winning, because it shows the habit of not checking forcing moves.
 */
export const missedMate: GameDetector = {
  id: "missed-mate",
  scope: "game",
  family: "tactical",
  detect(g) {
    const hits: DetectorHit[] = [];
    for (const m of playerMoves(g)) {
      const before = mateFor(m.scoreBefore, m.color);
      if (before === undefined || before <= 0 || before > MATE_HORIZON) continue;
      const after = mateFor(m.scoreAfter, m.color);
      if (after !== undefined && after > 0) continue;
      const best = m.bestUci ? ` with ${uciToSan(m.fenBefore, m.bestUci)}` : "";
      hits.push({
        gameId: g.analysis.gameId,
        ply: m.ply,
        winPctLoss: m.winPctLoss,
        evidence: `mate in ${before}${best}; played ${m.san}`,
        ...(m.bestUci ? { subject: m.bestUci } : {}),
      });
    }
    return hits;
  },
};
