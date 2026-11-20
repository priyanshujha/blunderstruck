import { moveMaterial, opposite, positionFromFen, type Role, type Square, see, squareName, uciToSan } from "../board";
import { answerTo, playerMoves, replyTo } from "../game";
import { HUNG_MIN_NET, isCountable } from "../rules";
import type { DetectorHit, GameDetector } from "../types";

const HANGABLE: ReadonlySet<Role> = new Set(["knight", "bishop", "rook", "queen"]);

/**
 * `hung-piece`: after a countable move, take the player's knight, bishop, rook or queen with the
 * largest net loss: what the opponent wins on its square by exchange count, minus what the move
 * itself captured or promoted to. Fires when that is at least `HUNG_MIN_NET` and the engine's
 * best reply or the actual reply lands on that square (on the game's last move, the engine's
 * `finalLine` answer). `subject` is the piece and square, so a
 * piece left hanging on two moves running counts once.
 */
export const hungPiece: GameDetector = {
  id: "hung-piece",
  scope: "game",
  family: "tactical",
  detect(g) {
    const hits: DetectorHit[] = [];
    for (const m of playerMoves(g)) {
      if (!isCountable(m)) continue;
      const reply = replyTo(g, m);
      // On the game's last move there is no reply: only the engine's answer (`finalLine`).
      const engineReply = reply ? reply.bestUci : answerTo(g, m)?.[0];
      if (!reply && !engineReply) continue;
      const board = positionFromFen(m.fenAfter).board;
      const won = moveMaterial(m.fenBefore, m.uci);
      let worst: { sq: Square; role: Role; net: number } | undefined;
      for (const [sq, p] of board) {
        if (p.color !== m.color || !HANGABLE.has(p.role)) continue;
        const net = see(board, sq, opposite(m.color)) - won;
        if (!worst || net > worst.net) worst = { sq, role: p.role, net };
      }
      if (!worst || worst.net < HUNG_MIN_NET) continue;
      const sq = squareName(worst.sq);
      const lands = (uci: string | undefined): boolean => uci?.slice(2, 4) === sq;
      const taken = lands(reply?.uci);
      if (!taken && !lands(engineReply)) continue;
      const outcome = taken
        ? `taken by ${reply!.san}`
        : reply
          ? "not taken"
          : `game ended before ${uciToSan(m.fenAfter, engineReply!)}`;
      hits.push({
        gameId: g.analysis.gameId,
        ply: m.ply,
        winPctLoss: m.winPctLoss,
        evidence: `${worst.role} on ${sq} left en prise (-${worst.net}), ${outcome}`,
        subject: `${worst.role} ${sq}`,
      });
    }
    return hits;
  },
};
