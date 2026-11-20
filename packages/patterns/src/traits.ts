import {
  type AnalyzedMove,
  BEST_LINE_MAX_PLIES,
  BLIND_SPOT_IDS,
  BLIND_SPOTS,
  type BlindSpotFamily,
  type BlindSpotId,
  type Color,
} from "@blunderstruck/contracts";
import { attacks } from "chessops/attacks";
import { attackersOf, classifyMotif, legalMove, lineOutcome, opposite, PIECE_VALUES, positionFromFen, type Role, type Square } from "./board";
import { answerTo, moveAt } from "./game";
import type { PlayerGame } from "./types";

/*
 * Traits: facts about one of the player's mistakes, read by replaying the stored engine lines
 * with legal-move rules. Exact given those lines, but a line is one refutation, not all of them.
 * The motif traits (`answer-fork`, `answer-discovered`, `best-fork`, `best-discovered`) use the
 * `classifyMotif` rules and are a heuristic ("looked like a fork").
 *
 * Two lines are read:
 * - "allowed" family: the punishing line, the engine's answer to the move played (`answerTo`).
 *   Its decisive part is the answer up to the point `lineOutcome` reads the result at (the
 *   quiet point or the mate) for the move plus the answer, as the tactic detectors read it.
 * - "missed" family: the engine's best line from the position before the move (`bestLine`),
 *   with its decisive part up to the point `lineOutcome` reads it at.
 *
 * "The piece lost" is the most valuable of the player's knights, bishops, rooks and queens the
 * opponent captures in the decisive part of the punishing line (the first one on a tie of
 * value). Pawns are never "the piece lost".
 */

/** One replayed ply. Squares are where the piece ends up (castling: the king's square). */
interface Step {
  color: Color;
  /** The moving piece's role after the move (a promoted pawn is its new piece). */
  role: Role;
  from: Square;
  to: Square;
  /** The piece taken and the square it stood on (en passant: the passed pawn's square). */
  captured?: { role: Role; square: Square };
  /** The castling rook's move. */
  rook?: { from: Square; to: Square };
  promotion: boolean;
  check: boolean;
  /** The moving piece itself attacks the king it checks (not only a discovered check). */
  directCheck: boolean;
}

/** Replays `line` (UCI) from `fen`, stopping at the first illegal move. */
function replay(fen: string, line: readonly string[]): Step[] {
  const pos = positionFromFen(fen);
  const steps: Step[] = [];
  for (const uci of line) {
    const m = legalMove(pos, uci);
    if (!m || !("from" in m)) break;
    const piece = pos.board.get(m.from)!;
    const target = pos.board.get(m.to);
    const rank = m.from - (m.from % 8);
    const castles =
      piece.role === "king" &&
      ((target?.role === "rook" && target.color === piece.color) || Math.abs((m.to % 8) - (m.from % 8)) === 2);
    let step: Step;
    if (castles) {
      const kingside = m.to > m.from;
      const rookFrom = target?.role === "rook" ? m.to : rank + (kingside ? 7 : 0);
      step = {
        color: piece.color,
        role: "king",
        from: m.from,
        to: rank + (kingside ? 6 : 2),
        rook: { from: rookFrom, to: rank + (kingside ? 5 : 3) },
        promotion: false,
        check: false,
        directCheck: false,
      };
    } else {
      let captured: Step["captured"];
      if (target && target.color !== piece.color) captured = { role: target.role, square: m.to };
      else if (piece.role === "pawn" && !target && m.to === pos.epSquare) {
        captured = { role: "pawn", square: m.to + (piece.color === "white" ? -8 : 8) };
      }
      step = {
        color: piece.color,
        role: m.promotion ?? piece.role,
        from: m.from,
        to: m.to,
        ...(captured ? { captured } : {}),
        promotion: !!m.promotion,
        check: false,
        directCheck: false,
      };
    }
    pos.play(m);
    step.check = pos.isCheck();
    if (step.check) {
      const king = pos.board.kingOf(pos.turn);
      const mover = pos.board.get(step.to);
      step.directCheck = king !== undefined && !!mover && attacks(mover, step.to, pos.board.occupied).has(king);
    }
    steps.push(step);
  }
  return steps;
}

/** Where the piece that made a move ended up. Undefined for an illegal move. */
function landing(fen: string, uci: string): Step | undefined {
  return replay(fen, [uci])[0];
}

const LOSABLE: ReadonlySet<Role> = new Set(["knight", "bishop", "rook", "queen"]);
const LOST_TRAIT: Readonly<Partial<Record<Role, BlindSpotId>>> = {
  knight: "lost-knight",
  bishop: "lost-bishop",
  rook: "lost-rook",
  queen: "lost-queen",
};

/**
 * The move-number band of a ply: move n is `ceil(ply / 2)`, counted from move 1 of a standard
 * game (a game from a set-up position keeps its FEN's move number).
 * - `moves-1-10`: moves 1 to 10 (plies 1 to 20);
 * - `moves-11-20`: moves 11 to 20 (plies 21 to 40);
 * - `moves-21-30`: moves 21 to 30 (plies 41 to 60);
 * - `moves-31-plus`: move 31 and later (ply 61 on).
 */
export function phaseTrait(ply: number): BlindSpotId {
  const n = Math.ceil(ply / 2);
  if (n <= 10) return "moves-1-10";
  if (n <= 20) return "moves-11-20";
  if (n <= 30) return "moves-21-30";
  return "moves-31-plus";
}

function allowedTraits(g: PlayerGame, move: AnalyzedMove, out: Set<BlindSpotId>): void {
  const answer = answerTo(g, move) ?? [];
  const steps = replay(move.fenAfter, answer);
  const key = steps[0];
  const played = landing(move.fenBefore, move.uci);
  if (!key || !played) return;
  const me = move.color;
  const them = opposite(me);

  // `answer-check`: the opponent's punishing move gives check.
  if (key.check) out.add("answer-check");
  // `answer-knight-check` (child of `answer-check`): that check is given by the knight that moved.
  if (key.check && key.role === "knight" && key.directCheck) out.add("answer-knight-check");

  const motif = classifyMotif(move.fenAfter, answer);
  // `answer-fork` (motif): the punishing move looked like a fork: the moved piece hits two
  // targets and takes one of them later in the line (`classifyMotif` "fork").
  if (motif === "fork") out.add("answer-fork");
  // `answer-discovered` (motif): the punishing move opened a line for another of the opponent's
  // long-range pieces onto the king or a piece it then takes (`classifyMotif` "discovered-attack").
  if (motif === "discovered-attack") out.add("answer-discovered");

  const outcome = lineOutcome(move.fenBefore, [move.uci, ...answer].slice(0, BEST_LINE_MAX_PLIES), me);
  const decisive = steps.slice(0, Math.max(1, outcome.plies - 1));
  const after = positionFromFen(move.fenAfter).board;
  const before = positionFromFen(move.fenBefore).board;

  // Each of the player's pieces, by where it stands now, mapped to where it stood after their move.
  const origin = new Map<Square, Square>();
  for (const sq of after[me]) origin.set(sq, sq);
  const losses: { role: Role; origin: Square }[] = [];
  for (const s of decisive) {
    if (s.color === me) {
      const o = origin.get(s.from);
      origin.delete(s.from);
      if (o !== undefined) origin.set(s.to, o);
      if (s.rook) {
        const r = origin.get(s.rook.from);
        origin.delete(s.rook.from);
        if (r !== undefined) origin.set(s.rook.to, r);
      }
    } else if (s.captured) {
      const o = origin.get(s.captured.square);
      origin.delete(s.captured.square);
      if (o !== undefined && LOSABLE.has(s.captured.role)) losses.push({ role: s.captured.role, origin: o });
    }
  }

  // `moved-piece-lost`: the punishing line takes the knight, bishop, rook or queen the player
  // had just moved.
  const movedLost = losses.some((l) => l.origin === played.to);
  if (movedLost) {
    out.add("moved-piece-lost");
    // `moved-onto-attacked` (child): that piece had moved to a square the opponent already attacked.
    if (attackersOf(after, played.to, them).nonEmpty()) out.add("moved-onto-attacked");
    // `moved-after-capture` (child): the move that put it there was itself a capture.
    if (played.captured) out.add("moved-after-capture");
  }

  let lost: { role: Role; origin: Square } | undefined;
  for (const l of losses) if (!lost || PIECE_VALUES[l.role] > PIECE_VALUES[lost.role]) lost = l;
  if (!lost) return;

  // `left-after-attack`: the piece lost had not moved, and the opponent's previous move attacked
  // it: the piece that moved attacks it, or the square had no attacker before that move.
  const prev = moveAt(g, move.ply - 1);
  const stood = before.get(lost.origin);
  if (lost.origin !== played.to && prev && stood?.color === me && stood.role === lost.role) {
    const prevTo = landing(prev.fenBefore, prev.uci)?.to;
    const nowAttacked = attackersOf(before, lost.origin, them);
    const wasAttacked = attackersOf(positionFromFen(prev.fenBefore).board, lost.origin, them);
    if (nowAttacked.nonEmpty() && ((prevTo !== undefined && nowAttacked.has(prevTo)) || wasAttacked.isEmpty())) {
      out.add("left-after-attack");
    }
  }
  // `undefended`: right after the player's move, none of their pieces defended the piece lost.
  if (attackersOf(after, lost.origin, me).isEmpty()) out.add("undefended");
  // `lost-knight`, `lost-bishop`, `lost-rook`, `lost-queen`: the piece lost.
  out.add(LOST_TRAIT[lost.role]!);
}

function missedTraits(g: PlayerGame, move: AnalyzedMove, out: Set<BlindSpotId>): void {
  const best = move.bestLine ?? [];
  const steps = replay(move.fenBefore, best);
  const key = steps[0];
  if (!key) return;
  const me = move.color;

  // `best-check`: the engine's best move gives check.
  if (key.check) out.add("best-check");
  // `best-knight` (child of `best-check`): that check is given by the knight that moved.
  if (key.check && key.role === "knight" && key.directCheck) out.add("best-knight");
  // `best-capture`: the best move captures something (en passant included).
  if (key.captured) out.add("best-capture");
  // `best-quiet`: the best move is not a check, a capture or a promotion.
  if (!key.check && !key.captured && !key.promotion) out.add("best-quiet");

  // `takes-last-moved`: in the decisive part of the best line, the player captures the piece the
  // opponent moved last (followed if it moves again in the line).
  const prev = moveAt(g, move.ply - 1);
  let tracked = prev ? landing(prev.fenBefore, prev.uci)?.to : undefined;
  if (tracked !== undefined) {
    const outcome = lineOutcome(move.fenBefore, best, me);
    for (const s of steps.slice(0, Math.max(1, outcome.plies))) {
      if (s.color === me && s.captured?.square === tracked) {
        out.add("takes-last-moved");
        break;
      }
      if (s.color !== me && s.from === tracked) tracked = s.to;
      if (s.color !== me && s.rook?.from === tracked) tracked = s.rook.to;
    }
  }

  const motif = classifyMotif(move.fenBefore, best);
  // `best-fork` (motif): the best move looked like a fork (`classifyMotif` "fork").
  if (motif === "fork") out.add("best-fork");
  // `best-discovered` (motif): the best move opened a line for another of the player's long-range
  // pieces onto the king or a piece it then takes (`classifyMotif` "discovered-attack").
  if (motif === "discovered-attack") out.add("best-discovered");
}

/**
 * The blind-spot properties that hold for one of the player's moves, read for `family`: the
 * "allowed" set from the engine's answer to the move, the "missed" set from the engine's best
 * line before it, and the move-number band for both. Meant for countable mistakes; it does not
 * check that itself. A child property (`parent` in `BLIND_SPOTS`) is only reported with its
 * parent. Ids come back in `BLIND_SPOT_IDS` order.
 */
export function traitsOf(g: PlayerGame, move: AnalyzedMove, family: BlindSpotFamily): BlindSpotId[] {
  const out = new Set<BlindSpotId>([phaseTrait(move.ply)]);
  if (family === "allowed") allowedTraits(g, move, out);
  else missedTraits(g, move, out);
  const inFamily = new Set(BLIND_SPOTS.filter((s) => s.family === family || s.family === "both").map((s) => s.id));
  return BLIND_SPOT_IDS.filter((id) => out.has(id) && inFamily.has(id));
}
