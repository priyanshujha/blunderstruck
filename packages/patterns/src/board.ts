import { type AnalyzedMove, BEST_LINE_MAX_PLIES, type Color, type TacticMotif } from "@blunderstruck/contracts";
import {
  attacks,
  between,
  bishopAttacks,
  kingAttacks,
  knightAttacks,
  pawnAttacks,
  rookAttacks,
} from "chessops/attacks";
import type { Board } from "chessops/board";
import { Chess, normalizeMove, type Position } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import type { SquareSet } from "chessops/squareSet";
import type { Move, NormalMove, Role, Square } from "chessops/types";
import { makeSquare, opposite, parseSquare, parseUci } from "chessops/util";
import { TACTIC_MIN_GAIN, TACTIC_SETTLE_MIN_PLIES } from "./rules";

export type { Board, Position, Role, Square };
export { makeSquare, opposite, parseSquare };

/** Material in pawns. The king is never captured, so it counts 0. */
export const PIECE_VALUES: Readonly<Record<Role, number>> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};

/** What a checkmate is worth in `LineOutcome.gain`: more than any material swing. */
export const MATE_VALUE = 100;

/** Attacker order for the exchange count: cheapest first, the king last. */
const ORDER: readonly Role[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];

/** A legal position from a FEN. Throws on a FEN chessops rejects. */
export function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
}

/** The first four FEN fields (board, side to move, castling, en passant): the same position however reached. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** "e4" from a square index. */
export const squareName = (sq: Square): string => makeSquare(sq);

/** "knight", "queen", ... as written in evidence text. */
export const pieceName = (role: Role): string => role;

/** Every piece of `color` that attacks `square`, given which squares are occupied. */
export function attackersOf(board: Board, square: Square, color: Color, occupied: SquareSet = board.occupied): SquareSet {
  const own = board[color];
  return pawnAttacks(opposite(color), square)
    .intersect(board.pieces(color, "pawn"))
    .union(knightAttacks(square).intersect(board.pieces(color, "knight")))
    .union(bishopAttacks(square, occupied).intersect(board.bishopsAndQueens()).intersect(own))
    .union(rookAttacks(square, occupied).intersect(board.rooksAndQueens()).intersect(own))
    .union(kingAttacks(square).intersect(board.pieces(color, "king")))
    .intersect(occupied);
}

function cheapest(board: Board, set: SquareSet): Square | undefined {
  for (const role of ORDER) {
    const s = set.intersect(board[role]).first();
    if (s !== undefined) return s;
  }
  return undefined;
}

/**
 * Static exchange evaluation: what `by` wins, in pawns, by starting a capture sequence on
 * `square`, both sides recapturing with their cheapest piece and stopping when it no longer
 * pays. 0 when the square holds no enemy piece, nothing attacks it, or capturing loses.
 * X-rays through pieces that have captured are seen; pins and en passant are not. A king
 * never captures onto a square the other side still attacks.
 */
export function see(board: Board, square: Square, by: Color): number {
  const target = board.get(square);
  if (!target || target.color === by) return 0;
  let occ = board.occupied;
  let side: Color = by;
  const gain: number[] = [PIECE_VALUES[target.role]];

  const first = cheapest(board, attackersOf(board, square, side, occ));
  if (first === undefined) return 0;
  if (board.get(first)!.role === "king" && attackersOf(board, square, opposite(side), occ.without(first)).nonEmpty()) {
    return 0;
  }
  let onSquare = PIECE_VALUES[board.get(first)!.role];
  occ = occ.without(first);
  side = opposite(side);

  let d = 0;
  for (;;) {
    const att = cheapest(board, attackersOf(board, square, side, occ));
    if (att === undefined) break;
    const isKing = board.get(att)!.role === "king";
    if (isKing && attackersOf(board, square, opposite(side), occ.without(att)).nonEmpty()) break;
    d++;
    gain[d] = onSquare - gain[d - 1]!;
    // A king only gets here when nothing can take it back, so the loop ends next round.
    onSquare = PIECE_VALUES[board.get(att)!.role];
    occ = occ.without(att);
    side = opposite(side);
  }
  for (; d > 0; d--) gain[d - 1] = -Math.max(-gain[d - 1]!, gain[d]!);
  return Math.max(0, gain[0]!);
}

/** `side`'s material minus the other side's, in pawns, kings excluded. */
export function material(board: Board, side: Color): number {
  let s = 0;
  for (const [, p] of board) s += (p.color === side ? 1 : -1) * PIECE_VALUES[p.role];
  return s;
}

/** The best exchange count the side to move has against any enemy piece, in pawns (0 if none). */
export function bestExchange(pos: Position): number {
  let best = 0;
  for (const [sq, p] of pos.board) {
    if (p.color !== pos.turn && p.role !== "king") best = Math.max(best, see(pos.board, sq, pos.turn));
  }
  return best;
}

/** The legal chessops move for a UCI string in `pos`, or undefined if it is not legal there. */
export function legalMove(pos: Position, uci: string): Move | undefined {
  const raw = parseUci(uci);
  if (!raw) return undefined;
  const m = normalizeMove(pos, raw);
  return pos.isLegal(m) ? m : undefined;
}

/**
 * Material a move wins outright, in pawns: the piece it captures (en passant included) plus,
 * for a promotion, the new piece minus the pawn. 0 for a quiet or illegal move.
 */
export function moveMaterial(fen: string, uci: string): number {
  const pos = positionFromFen(fen);
  const m = legalMove(pos, uci) as NormalMove | undefined;
  if (!m || !("from" in m)) return 0;
  const moving = pos.board.get(m.from)!;
  const target = pos.board.get(m.to);
  let won = target && target.color !== moving.color ? PIECE_VALUES[target.role] : 0;
  if (moving.role === "pawn" && !target && m.to === pos.epSquare) won = PIECE_VALUES.pawn;
  if (m.promotion) won += PIECE_VALUES[m.promotion] - PIECE_VALUES.pawn;
  return won;
}

/**
 * Net material a move wins once the exchange on its destination is over: `moveMaterial` minus
 * what the opponent then wins there by exchange count. A capture of an undefended bishop is +3;
 * pawn takes a defended knight is +2; a quiet move to an attacked square is negative.
 */
export function exchangeGain(fen: string, uci: string): number {
  const pos = positionFromFen(fen);
  const m = legalMove(pos, uci);
  if (!m || !("from" in m)) return 0;
  const won = moveMaterial(fen, uci);
  const mover = pos.turn;
  pos.play(m);
  return won - see(pos.board, m.to, opposite(mover));
}

/** What a line of play comes to, from one side's point of view. */
export interface LineOutcome {
  /** A checkmate somewhere in the line: delivered by `side` ("for") or to it ("against"). */
  mate?: "for" | "against";
  /** Material change for `side`, in pawns, at the quiet point; `±MATE_VALUE` when there is a mate. */
  gain: number;
  /** Plies up to the result: the mating ply, else the quiet point, else every legal ply replayed. */
  plies: number;
}

/**
 * Replays `line` (UCI) from `fen`, stopping at the first illegal move, and scores it for `side`:
 * - a checkmate anywhere in the (legal part of the) line is a mate for whoever delivered it,
 *   even after a quiet point; `plies` is then the ply of the mate;
 * - otherwise material is read at the first quiet point: the first ply from
 *   `TACTIC_SETTLE_MIN_PLIES` onwards where the side to move is not in check and the line's
 *   next move is not a capture;
 * - a line that ends before a quiet point takes the material at its end, adjusted by the best
 *   exchange count available to the side to move.
 */
export function lineOutcome(fen: string, line: readonly string[], side: Color): LineOutcome {
  const pos = positionFromFen(fen);
  const start = material(pos.board, side);
  let plies = 0;
  // The quiet-point reading, kept while the rest of the line is still checked for a mate.
  let settled: LineOutcome | undefined;
  for (let i = 0; i < line.length; i++) {
    const m = legalMove(pos, line[i]!);
    if (!m) break;
    pos.play(m);
    plies++;
    if (pos.isCheckmate()) {
      const deliveredBySide = pos.turn !== side;
      return { mate: deliveredBySide ? "for" : "against", gain: deliveredBySide ? MATE_VALUE : -MATE_VALUE, plies };
    }
    if (!settled && plies >= TACTIC_SETTLE_MIN_PLIES && !pos.isCheck()) {
      const next = line[i + 1] ? parseUci(line[i + 1]!) : undefined;
      const nextCaptures = !!next && "from" in next && pos.board.has(next.to);
      if (!nextCaptures) settled = { gain: material(pos.board, side) - start, plies };
    }
  }
  if (settled) return settled;
  let end = material(pos.board, side) - start;
  if (!pos.isEnd()) {
    const q = bestExchange(pos);
    end += pos.turn === side ? q : -q;
  }
  return { gain: end, plies };
}

/**
 * The tactic swing condition: the best line mates and the played one does not, or the best
 * line comes out at least `TACTIC_MIN_GAIN` pawns ahead of the played one.
 */
export function tacticSwing(best: LineOutcome, played: LineOutcome): boolean {
  if (best.mate === "for" && played.mate !== "for") return true;
  return best.gain - played.gain >= TACTIC_MIN_GAIN;
}

/** Best and played lines of one move, scored for the mover. */
export interface LineComparison {
  /** `lineOutcome(move.fenBefore, move.bestLine, mover)`. */
  best: LineOutcome;
  /** `lineOutcome(move.fenBefore, [move.uci, ...reply.bestLine], mover)`, cut to `BEST_LINE_MAX_PLIES`. */
  played: LineOutcome;
  /** `tacticSwing(best, played)`. */
  swing: boolean;
}

/**
 * Scores the engine's line against what was played for one move. `reply` is the next ply's
 * entry (the opponent's move), whose `bestLine` is the engine's answer to the played move.
 * `answer` overrides that answer; pass the game's `finalLine` for its last move (see `answerTo`).
 * Undefined when the move has no `bestLine` or was the engine's own choice.
 */
export function compareLines(
  move: AnalyzedMove,
  reply: AnalyzedMove | undefined,
  answer: readonly string[] | undefined = reply?.bestLine,
): LineComparison | undefined {
  if (!move.bestLine || move.bestLine.length === 0 || move.uci === move.bestUci) return undefined;
  const playedLine = [move.uci, ...(answer ?? [])].slice(0, BEST_LINE_MAX_PLIES);
  const best = lineOutcome(move.fenBefore, move.bestLine, move.color);
  const played = lineOutcome(move.fenBefore, playedLine, move.color);
  return { best, played, swing: tacticSwing(best, played) };
}

const SLIDERS: ReadonlySet<Role> = new Set(["bishop", "rook", "queen"]);

/**
 * Names the tactic in `line` (UCI from `fen`) for the side to move in `fen`, whose first move
 * is the key move:
 * - "mate": the line contains a checkmate by that side;
 * - "fork": after the key move, the moved piece attacks at least two targets (the king, a piece
 *   worth more than it, or a piece won by exchange count), and that same piece later in the
 *   line (the side's 2nd or 3rd move) captures one of them;
 * - "discovered-attack": the key move opens a line from one of the side's other sliders to an
 *   enemy piece, and that is check or the slider later captures the piece.
 * Undefined when none applies (pins and skewers are not named).
 */
export function classifyMotif(fen: string, line: readonly string[]): TacticMotif | undefined {
  if (line.length === 0) return undefined;
  const before = positionFromFen(fen);
  const me = before.turn;
  const them = opposite(me);
  if (lineOutcome(fen, line, me).mate === "for") return "mate";

  const key = legalMove(before, line[0]!);
  if (!key || !("from" in key)) return undefined;
  const after = before.clone();
  after.play(key);
  const b = after.board;
  // The side's next two moves of the line (plies 3 and 5).
  const myLater = [line[2], line[4]]
    .map((u) => (u ? parseUci(u) : undefined))
    .filter((m): m is NormalMove => !!m && "from" in m);

  const moved = b.get(key.to);
  if (moved && moved.color === me) {
    const targets: Square[] = [];
    for (const s of attacks(moved, key.to, b.occupied).intersect(b[them])) {
      const t = b.get(s)!;
      if (t.role === "king" || PIECE_VALUES[t.role] > PIECE_VALUES[moved.role] || see(b, s, me) > 0) targets.push(s);
    }
    if (targets.length >= 2 && myLater.some((m) => m.from === key.to && targets.includes(m.to))) return "fork";
  }

  for (const [ys, y] of before.board) {
    if (y.color !== me || !SLIDERS.has(y.role) || ys === key.from) continue;
    for (const [ts, t] of b) {
      if (t.color !== them || !between(ys, ts).has(key.from)) continue;
      if (!attacks(y, ys, b.occupied).has(ts) || attacks(y, ys, before.board.occupied).has(ts)) continue;
      if (t.role === "king" || myLater.some((m) => m.from === ys && m.to === ts)) return "discovered-attack";
    }
  }
  return undefined;
}

/** SAN of a UCI move in `fen`; the UCI itself when it is not legal there. */
export function uciToSan(fen: string, uci: string): string {
  const pos = positionFromFen(fen);
  const m = legalMove(pos, uci);
  return m ? makeSan(pos, m) : uci;
}

/** SAN of a UCI line from `fen`, stopping at the first illegal move. */
export function lineToSan(fen: string, line: readonly string[]): string[] {
  const pos = positionFromFen(fen);
  const out: string[] = [];
  for (const u of line) {
    const m = legalMove(pos, u);
    if (!m) break;
    out.push(makeSan(pos, m));
    pos.play(m);
  }
  return out;
}

/** "4.Ba6" for White's 4th move, "4...d6" for Black's (plies counted from move 1). */
export function moveLabel(move: Pick<AnalyzedMove, "ply" | "color" | "san">): string {
  const n = Math.ceil(move.ply / 2);
  return `${n}${move.color === "white" ? "." : "..."}${move.san}`;
}
