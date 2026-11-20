import type { Color, StoryPiece } from "@blunderstruck/contracts";
import { legalMove, material, PIECE_VALUES, positionFromFen } from "./board";
import { HUNG_MIN_NET } from "./rules";

/**
 * The piece `side` lost along `line` (UCI from `fen`, replayed up to its first illegal move):
 * the scored part of a line, such as a played move and the engine's answer to it.
 *
 * Captures are netted against everything `side` took back in the line. A knight, bishop, rook
 * or queen of `side` taken in the line is lost when the line's net loss is at least that
 * piece's value minus what `side` won in the line: a piece for a pawn is a lost piece, a knight
 * for a knight and a pawn is not. Nothing is lost when the net loss is under `HUNG_MIN_NET`
 * pawns (a minor piece for a pawn) or no such piece was taken. The most valuable qualifying
 * piece is named, the earliest taken on a tie, with the square it was taken on.
 */
export function lostPiece(fen: string, line: readonly string[], side: Color): StoryPiece | undefined {
  const pos = positionFromFen(fen);
  const start = material(pos.board, side);
  let won = 0;
  const taken: StoryPiece[] = [];
  for (const uci of line) {
    const m = legalMove(pos, uci);
    if (!m || !("from" in m)) break;
    const mover = pos.board.get(m.from)!;
    const target = pos.board.get(m.to);
    const enPassant = mover.role === "pawn" && !target && (m.from & 7) !== (m.to & 7);
    if (target && target.color !== mover.color) {
      if (mover.color === side) won += PIECE_VALUES[target.role];
      else if (target.role !== "pawn" && target.role !== "king") taken.push({ square: uci.slice(2, 4), piece: target.role, color: side });
    } else if (enPassant && mover.color === side) {
      won += PIECE_VALUES.pawn;
    }
    pos.play(m);
  }
  const netLoss = start - material(pos.board, side);
  if (netLoss < HUNG_MIN_NET) return undefined;
  let best: StoryPiece | undefined;
  for (const p of taken) {
    if (netLoss < PIECE_VALUES[p.piece] - won) continue;
    if (!best || PIECE_VALUES[p.piece] > PIECE_VALUES[best.piece]) best = p;
  }
  return best;
}
