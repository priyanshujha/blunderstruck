import type { Color } from "@blunderstruck/contracts";
import type { Position } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { parseComment, parsePgn, startingPosition } from "chessops/pgn";
import { parseSan } from "chessops/san";
import type { Move } from "chessops/types";
import { makeUci } from "chessops/util";

export interface Ply {
  /**
   * Half-move number counted from move 1 of a standard game: White's 1st move is 1, Black's
   * 1st is 2. A game that starts from a custom position keeps that position's numbering.
   */
  ply: number;
  color: Color;
  san: string;
  /** Standard UCI as engines write it: castling is the king's two-square move ("e1g1"). */
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Mover's clock after the move, when the PGN carries %clk. */
  clockSeconds?: number;
  /** Set when this move ended the game on the board. */
  terminal?: "checkmate" | "draw";
}

/** chessops encodes castling as king-takes-own-rook ("e1h1"); engines use the king's destination. */
function standardUci(pos: Position, move: Move): string {
  if ("from" in move) {
    const piece = pos.board.get(move.from);
    const target = pos.board.get(move.to);
    if (piece?.role === "king" && target?.role === "rook" && target.color === piece.color) {
      const rank = move.from >> 3;
      const file = move.to > move.from ? 6 : 2;
      return makeUci({ from: move.from, to: rank * 8 + file });
    }
  }
  return makeUci(move);
}

/** Replays the main line of the first game in a PGN. Stops at the first illegal move. */
export function pliesFromPgn(pgn: string): Ply[] {
  const game = parsePgn(pgn)[0];
  if (!game) return [];
  const pos = startingPosition(game.headers).unwrap();
  const firstPly = (pos.fullmoves - 1) * 2 + (pos.turn === "white" ? 1 : 2);
  const out: Ply[] = [];
  for (const node of game.moves.mainline()) {
    const move = parseSan(pos, node.san);
    if (!move) break;
    const color: Color = pos.turn;
    const fenBefore = makeFen(pos.toSetup());
    const uci = standardUci(pos, move);
    pos.play(move);
    const clock = node.comments?.map((c) => parseComment(c).clock).find((c) => c !== undefined);
    out.push({
      ply: firstPly + out.length,
      color,
      san: node.san,
      uci,
      fenBefore,
      fenAfter: makeFen(pos.toSetup()),
      clockSeconds: clock,
      terminal: pos.isCheckmate() ? "checkmate" : pos.isEnd() ? "draw" : undefined,
    });
  }
  return out;
}
