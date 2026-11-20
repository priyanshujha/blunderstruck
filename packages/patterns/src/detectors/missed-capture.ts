import { exchangeGain, moveLabel, parseSquare, positionFromFen, type Role, uciToSan } from "../board";
import { playerMoves } from "../game";
import { TACTIC_MIN_GAIN } from "../rules";
import type { DetectorHit, GameDetector } from "../types";
import { missesTactic, readTactic } from "./missed-tactic";

/** The enemy piece `uci` captures in `fen` (en passant included), or undefined for a non-capture. */
function capturedRole(fen: string, uci: string): Role | undefined {
  const pos = positionFromFen(fen);
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  const piece = from === undefined ? undefined : pos.board.get(from);
  if (!piece || to === undefined) return undefined;
  const target = pos.board.get(to);
  if (target && target.color !== piece.color) return target.role;
  if (piece.role === "pawn" && pos.epSquare === to) return "pawn";
  return undefined;
}

/**
 * `missed-capture`: the `missed-tactic` predicate holds, the engine's best move is a capture
 * winning at least `TACTIC_MIN_GAIN` pawns by exchange count, and the played move did not land
 * on that square. `subject` is the best move, so missing it twice running counts once.
 */
export const missedCapture: GameDetector = {
  id: "missed-capture",
  scope: "game",
  family: "tactical",
  detect(g) {
    const hits: DetectorHit[] = [];
    for (const m of playerMoves(g)) {
      const t = readTactic(g, m);
      if (!t || !missesTactic(t) || !m.bestUci) continue;
      const role = capturedRole(m.fenBefore, m.bestUci);
      if (!role) continue;
      const net = exchangeGain(m.fenBefore, m.bestUci);
      if (net < TACTIC_MIN_GAIN) continue;
      if (m.uci.slice(2, 4) === m.bestUci.slice(2, 4)) continue;
      hits.push({
        gameId: g.analysis.gameId,
        ply: m.ply,
        winPctLoss: m.winPctLoss,
        evidence: `${uciToSan(m.fenBefore, m.bestUci)} would have won a ${role} (+${net}); played ${moveLabel(m)}`,
        subject: m.bestUci,
      });
    }
    return hits;
  },
};
