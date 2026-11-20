import { TACTIC_MIN_GAIN } from "../rules";
import { playerMoves } from "../game";
import type { DetectorHit, GameDetector } from "../types";
import { classifyMotif } from "../board";
import { readTactic, sanLine } from "./missed-tactic";

/**
 * `allowed-tactic`: a countable move where the tactic swing condition holds and the played line
 * (the move plus the engine's answer to it) is mated or loses at least `TACTIC_MIN_GAIN` pawns.
 * `motif` names the opponent's tactic. `subject` is the opponent's key move, so leaving the same
 * shot on for a second move counts once.
 */
export const allowedTactic: GameDetector = {
  id: "allowed-tactic",
  scope: "game",
  family: "tactical",
  detect(g) {
    const hits: DetectorHit[] = [];
    for (const m of playerMoves(g)) {
      const t = readTactic(g, m);
      if (!t) continue;
      if (t.played.mate !== "against" && t.played.gain > -TACTIC_MIN_GAIN) continue;
      const answer = t.answer;
      const line = answer.length > 0 ? sanLine(m.fenAfter, answer, t.played.plies - 1) : "";
      const motif = answer.length > 0 ? classifyMotif(m.fenAfter, answer) : undefined;
      const what = t.played.mate === "against" ? "mates" : `wins ${-t.played.gain}`;
      const shot = line ? `${line}${motif && motif !== "mate" ? ` (${motif})` : ""}, which ${what}` : `a loss of ${-t.played.gain}`;
      hits.push({
        gameId: g.analysis.gameId,
        ply: m.ply,
        winPctLoss: m.winPctLoss,
        evidence: `allowed ${shot}`,
        ...(answer[0] ? { subject: answer[0] } : {}),
        ...(motif ? { motif } : {}),
      });
    }
    return hits;
  },
};
