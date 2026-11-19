import type { Color } from "@blunderstruck/contracts";
import { makeFen } from "chessops/fen";
import { parseComment, parsePgn, startingPosition } from "chessops/pgn";
import { parseSan } from "chessops/san";
import { makeUci } from "chessops/util";

export interface Ply {
  /** 1-based half-move number. */
  ply: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Mover's clock after the move, when the PGN carries %clk. */
  clockSeconds?: number;
  /** Set when this move ended the game on the board. */
  terminal?: "checkmate" | "draw";
}

/** Replays the main line of the first game in a PGN. Stops at the first illegal move. */
export function pliesFromPgn(pgn: string): Ply[] {
  const game = parsePgn(pgn)[0];
  if (!game) return [];
  const pos = startingPosition(game.headers).unwrap();
  const out: Ply[] = [];
  for (const node of game.moves.mainline()) {
    const move = parseSan(pos, node.san);
    if (!move) break;
    const color: Color = pos.turn;
    const fenBefore = makeFen(pos.toSetup());
    pos.play(move);
    const clock = node.comments?.map((c) => parseComment(c).clock).find((c) => c !== undefined);
    out.push({
      ply: out.length + 1,
      color,
      san: node.san,
      uci: makeUci(move),
      fenBefore,
      fenAfter: makeFen(pos.toSetup()),
      clockSeconds: clock,
      terminal: pos.isCheckmate() ? "checkmate" : pos.isEnd() ? "draw" : undefined,
    });
  }
  return out;
}
