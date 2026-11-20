import type { Color, PieceRole, StoryPiece } from "@blunderstruck/contracts";
import type { Role } from "chessops/types";
import { legalMove, material, PIECE_VALUES, positionFromFen } from "./board";
import { HUNG_MIN_NET } from "./rules";

const PIECES: ReadonlySet<Role> = new Set(["knight", "bishop", "rook", "queen"]);
const MINORS: ReadonlySet<Role> = new Set(["knight", "bishop"]);

/** What a line cost one side, read by `lineLoss`. */
export interface LineLoss {
  /** Material `side` is down at the end of the line, in pawns (negative when it is up). */
  net: number;
  /** The piece lost. */
  piece?: StoryPiece;
  /**
   * The most valuable enemy piece won for `piece` ("your rook for a knight"). Absent when the
   * piece went for nothing or for pawns only.
   */
  for?: PieceRole;
  /**
   * The exchange: a rook of `side` went for a knight or bishop (neither cancelled by a trade)
   * and `side` is down at least `HUNG_MIN_NET` for it (nothing won back). The one definition
   * of "the exchange"; a rook for a minor piece and a pawn is a pawn count, not the exchange.
   */
  exchange: boolean;
}

interface Capture {
  index: number;
  square: string;
  role: Role;
}

/**
 * Reads what `line` (UCI from `fen`, replayed up to its first illegal move) cost `side`:
 * - `net` is the line's net material loss for `side`;
 * - trades are set aside first: each knight, bishop, rook or queen `side` took cancels one of
 *   its own pieces of the same value taken in the line, preferring one taken earlier on the
 *   same square (a recapture), then one of the same role;
 * - `piece` is named only when exactly one of `side`'s pieces is left after that and the net
 *   loss is at least `HUNG_MIN_NET` (a minor piece for a pawn): with `for` when exactly one
 *   enemy piece is left won for it, alone when none was (it went for nothing or for pawns, and
 *   is worth at most twice the net loss). Any messier case names nothing; `net` still holds.
 *
 * A queen for a knight is the queen for a knight. A queen for a rook and a knight, a queen and
 * a knight for a rook, or a knight for a knight and a pawn, name nothing.
 */
export function lineLoss(fen: string, line: readonly string[], side: Color): LineLoss {
  const pos = positionFromFen(fen);
  const start = material(pos.board, side);
  const lost: Capture[] = [];
  const won: Capture[] = [];
  line.some((uci, index) => {
    const m = legalMove(pos, uci);
    if (!m || !("from" in m)) return true;
    const mover = pos.board.get(m.from)!;
    const target = pos.board.get(m.to);
    if (target && target.color !== mover.color && PIECES.has(target.role)) {
      (mover.color === side ? won : lost).push({ index, square: uci.slice(2, 4), role: target.role });
    }
    pos.play(m);
    return false;
  });
  const net = start - material(pos.board, side);

  const open = [...lost];
  const unmatched: Capture[] = [];
  // Only pieces of equal value cancel; among them a recapture on the same square comes first.
  const same = (l: Capture, w: Capture): boolean => PIECE_VALUES[l.role] === PIECE_VALUES[w.role];
  const passes: ((l: Capture, w: Capture) => boolean)[] = [
    (l, w) => same(l, w) && l.square === w.square && l.index < w.index,
    (l, w) => l.role === w.role,
    same,
  ];
  let pending = [...won];
  for (const matches of passes) {
    pending = pending.filter((w) => {
      const i = open.findIndex((l) => matches(l, w));
      if (i === -1) return true;
      open.splice(i, 1);
      return false;
    });
  }
  unmatched.push(...pending);

  // One piece for one piece, or one piece for nothing or pawns; anything messier names nothing.
  const top = open.length === 1 ? open[0] : undefined;
  const gotFor = unmatched.length === 1 ? unmatched[0] : undefined;
  const named =
    !!top && unmatched.length <= 1 && net >= HUNG_MIN_NET && (!!gotFor || PIECE_VALUES[top.role] <= 2 * net);
  const exchange = net >= HUNG_MIN_NET && open.some((l) => l.role === "rook") && unmatched.some((w) => MINORS.has(w.role));
  return {
    net,
    ...(named ? { piece: { square: top!.square, piece: top!.role, color: side } } : {}),
    ...(named && gotFor ? { for: gotFor.role } : {}),
    exchange,
  };
}

/** The piece `side` lost along `line` (see `lineLoss`), or undefined when none is named. */
export function lostPiece(fen: string, line: readonly string[], side: Color): StoryPiece | undefined {
  return lineLoss(fen, line, side).piece;
}
