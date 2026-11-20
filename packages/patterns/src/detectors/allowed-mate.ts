import { lineToSan } from "../board";
import { answerTo, mateFor, playerMoves, replyTo } from "../game";
import { ALREADY_LOST, MATE_HORIZON } from "../rules";
import type { DetectorHit, GameDetector } from "../types";

/**
 * `allowed-mate`: after the move the opponent mates in `MATE_HORIZON` or fewer; before it the
 * player was not already being mated and had more than `ALREADY_LOST` win%.
 */
export const allowedMate: GameDetector = {
  id: "allowed-mate",
  scope: "game",
  family: "tactical",
  detect(g) {
    const hits: DetectorHit[] = [];
    for (const m of playerMoves(g)) {
      const after = mateFor(m.scoreAfter, m.color);
      if (after === undefined || after >= 0 || -after > MATE_HORIZON) continue;
      const before = mateFor(m.scoreBefore, m.color);
      if (before !== undefined && before < 0) continue;
      if (m.winPctBefore <= ALREADY_LOST) continue;
      const n = -after;
      // The mating line from the engine's answer to the move: the opponent's n moves and the
      // player's n - 1 replies in between.
      const reply = replyTo(g, m);
      const line = answerTo(g, m) ?? (reply?.bestUci ? [reply.bestUci] : []);
      const san = lineToSan(m.fenAfter, line.slice(0, 2 * n - 1));
      hits.push({
        gameId: g.analysis.gameId,
        ply: m.ply,
        winPctLoss: m.winPctLoss,
        evidence: `allowed mate in ${n}${san.length ? ` (${san.join(" ")})` : ""}`,
      });
    }
    return hits;
  },
};
