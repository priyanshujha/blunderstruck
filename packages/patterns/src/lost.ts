import type { Color, StoryPiece } from "@blunderstruck/contracts";
import type { Role } from "chessops/types";
import { legalMove, material, PIECE_VALUES, positionFromFen } from "./board";
import { HUNG_MIN_NET } from "./rules";

const PIECES: ReadonlySet<Role> = new Set(["knight", "bishop", "rook", "queen"]);
const MINORS: ReadonlySet<Role> = new Set(["knight", "bishop"]);

/** What a line cost one side, read by `lineLoss`. */
export interface LineLoss {
  /** Material `side` is down at the end of the line, in pawns (negative when it is up). */
  net: number;
  /** The piece lost, by the rule of `lostPiece`. */
  piece?: StoryPiece;
  /** No piece is named, but `side` gave a rook for a knight or bishop and is down for it: "the exchange". */
  exchange: boolean;
}

/**
 * Reads what `line` (UCI from `fen`, replayed up to its first illegal move) cost `side`:
 * - `net` is the line's net material loss for `side`;
 * - trades are set aside first: each knight, bishop, rook or queen `side` took cancels one of
 *   its own pieces taken in the line of the same value (queen for queen, knight for bishop);
 * - `piece` is the most valuable of `side`'s remaining taken pieces whose value is at most
 *   twice the net loss, when the net loss is at least `HUNG_MIN_NET` (a minor piece for a
 *   pawn). A piece for a pawn and a queen for a knight name the piece; a queen for a rook and a
 *   knight, a knight for a knight and a pawn, and the exchange (a rook for a minor piece) do not.
 */
export function lineLoss(fen: string, line: readonly string[], side: Color): LineLoss {
  const pos = positionFromFen(fen);
  const start = material(pos.board, side);
  const lost: StoryPiece[] = [];
  const won: Role[] = [];
  for (const uci of line) {
    const m = legalMove(pos, uci);
    if (!m || !("from" in m)) break;
    const mover = pos.board.get(m.from)!;
    const target = pos.board.get(m.to);
    if (target && target.color !== mover.color && PIECES.has(target.role)) {
      if (mover.color === side) won.push(target.role);
      else lost.push({ square: uci.slice(2, 4), piece: target.role, color: side });
    }
    pos.play(m);
  }
  const net = start - material(pos.board, side);

  const open = [...lost];
  const unmatchedWon: Role[] = [];
  for (const role of won) {
    const i = open.findIndex((p) => PIECE_VALUES[p.piece] === PIECE_VALUES[role]);
    if (i === -1) unmatchedWon.push(role);
    else open.splice(i, 1);
  }

  let piece: StoryPiece | undefined;
  if (net >= HUNG_MIN_NET) {
    for (const p of open) {
      if (PIECE_VALUES[p.piece] > 2 * net) continue;
      if (!piece || PIECE_VALUES[p.piece] > PIECE_VALUES[piece.piece]) piece = p;
    }
  }
  const exchange =
    !piece && net >= 1 && open.some((p) => p.piece === "rook") && unmatchedWon.some((r) => MINORS.has(r));
  return { net, ...(piece ? { piece } : {}), exchange };
}

/** The piece `side` lost along `line` (see `lineLoss`), or undefined when none is named. */
export function lostPiece(fen: string, line: readonly string[], side: Color): StoryPiece | undefined {
  return lineLoss(fen, line, side).piece;
}
