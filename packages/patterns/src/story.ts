import {
  BEST_LINE_MAX_PLIES,
  type BetterReason,
  blindSpotFamilyOf,
  type Color,
  type ExampleStory,
  type MoveDetail,
  type PatternFinding,
  STORY_LINE_MAX_PLIES,
  type StoryPiece,
} from "@blunderstruck/contracts";
import { attacks, between } from "chessops/attacks";
import type { Board } from "chessops/board";
import type { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import type { Move, Role, Square } from "chessops/types";
import { makeSquare, makeUci, opposite } from "chessops/util";
import { legalMove, lineOutcome, material, PIECE_VALUES, positionFromFen, see } from "./board";
import { answerTo, moveAt, replyTo } from "./game";
import { TACTIC_MIN_GAIN } from "./rules";
import type { PlayerGame } from "./types";

/** One replayed ply, with the square of the piece it took (the pawn's square for en passant). */
interface Step {
  detail: MoveDetail;
  capturedOn?: Square;
}

const SLIDERS: ReadonlySet<Role> = new Set(["bishop", "rook", "queen"]);

/** Standard UCI for a legal chessops move: castling is the king's two-square move. */
function standardUci(pos: Chess, m: Move): string {
  if ("from" in m) {
    const piece = pos.board.get(m.from);
    const target = pos.board.get(m.to);
    if (piece?.role === "king" && target?.role === "rook" && target.color === piece.color) {
      return makeUci({ from: m.from, to: (m.from >> 3) * 8 + (m.to > m.from ? 6 : 2) });
    }
  }
  return makeUci(m);
}

/** Plays the legal move `m` on `pos` and describes it. */
function playStep(pos: Chess, m: Move): Step {
  if (!("from" in m)) throw new Error("story: drop moves do not occur in standard chess");
  const piece = pos.board.get(m.from)!;
  const target = pos.board.get(m.to);
  const castle = piece.role === "king" && target?.role === "rook" && target.color === piece.color;
  const enPassant = piece.role === "pawn" && !target && (m.from & 7) !== (m.to & 7);
  const captured: Role | undefined = enPassant ? "pawn" : target && target.color !== piece.color ? target.role : undefined;
  const capturedOn: Square | undefined = enPassant ? (m.from & ~7) | (m.to & 7) : captured ? m.to : undefined;
  const san = makeSan(pos, m);
  const uci = standardUci(pos, m);
  pos.play(m);
  const detail: MoveDetail = {
    san,
    uci,
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    piece: piece.role,
    color: piece.color,
    ...(captured ? { captured } : {}),
    check: pos.isCheck(),
    mate: pos.isCheckmate(),
    ...(m.promotion ? { promotion: m.promotion } : {}),
    ...(castle ? { castle: m.to > m.from ? ("king" as const) : ("queen" as const) } : {}),
    ...(enPassant ? { enPassant: true as const } : {}),
    fenAfter: makeFen(pos.toSetup()),
  };
  return { detail, ...(capturedOn !== undefined ? { capturedOn } : {}) };
}

/**
 * The `MoveDetail` of a UCI move from `fen`, replayed with legal-move rules. Undefined when the
 * move is not legal there.
 */
export function moveDetail(fen: string, uci: string): MoveDetail | undefined {
  const pos = positionFromFen(fen);
  const m = legalMove(pos, uci);
  return m ? playStep(pos, m).detail : undefined;
}

/** Plays up to `max` plies of `line` on `pos`, stopping at the first illegal move. */
function replay(pos: Chess, line: readonly string[], max: number): Step[] {
  const steps: Step[] = [];
  for (const uci of line.slice(0, Math.max(0, max))) {
    const m = legalMove(pos, uci);
    if (!m) break;
    steps.push(playStep(pos, m));
  }
  return steps;
}

/** A ply that changes material or forces the reply: a capture, a promotion, a check or a mate. */
const isEvent = (d: MoveDetail): boolean => !!d.captured || !!d.promotion || d.check || d.mate;

/** `steps` cut after their last event; when there is none, the first `min` plies. */
function cutAtLastEvent(steps: readonly Step[], min: number): Step[] {
  let last = -1;
  steps.forEach((s, i) => {
    if (isEvent(s.detail)) last = i;
  });
  return steps.slice(0, Math.max(last + 1, Math.min(min, steps.length)));
}

/** The most valuable piece of `color` taken in `steps` (earliest on a tie), where it was taken. */
function biggestLoss(steps: readonly Step[], color: Color): StoryPiece | undefined {
  let best: StoryPiece | undefined;
  for (const s of steps) {
    const role = s.detail.captured;
    if (!role || s.detail.color === color || s.capturedOn === undefined) continue;
    if (!best || PIECE_VALUES[role] > PIECE_VALUES[best.piece]) best = { square: makeSquare(s.capturedOn), piece: role, color };
  }
  return best;
}

/** Material change for `color` from `before` to `after`, in pawns. */
const materialChange = (before: Board, after: Board, color: Color): number => material(after, color) - material(before, color);

/**
 * Pieces of `victim` that a piece of role `role` on `from` attacks in `b` and that are worth
 * attacking: the king, a piece worth more than the attacker, or a piece won by exchange count.
 */
function worthAttacking(b: Board, from: Square, role: Role, victim: Color, only?: (s: Square) => boolean): StoryPiece[] {
  const by = opposite(victim);
  const out: StoryPiece[] = [];
  for (const s of attacks({ role, color: by }, from, b.occupied).intersect(b[victim])) {
    if (only && !only(s)) continue;
    const t = b.get(s)!;
    if (t.role === "king" || PIECE_VALUES[t.role] > PIECE_VALUES[role] || see(b, s, by) > 0) {
      out.push({ square: makeSquare(s), piece: t.role, color: victim });
    }
  }
  // The king first, then the most valuable, then by square.
  const rank = (p: StoryPiece): number => (p.piece === "king" ? 100 : PIECE_VALUES[p.piece]);
  return out.sort((a, b2) => rank(b2) - rank(a) || (a.square < b2.square ? -1 : a.square > b2.square ? 1 : 0));
}

/**
 * Reads a key move (`key`, played in `before`): the pieces of the other side it attacks and,
 * when it opens a line from another of the mover's sliders, that slider and what it newly
 * attacks.
 */
function readKeyMove(before: Chess, key: MoveDetail): { targets: StoryPiece[]; rear?: StoryPiece } {
  const b = positionFromFen(key.fenAfter).board;
  const mover = key.color;
  const victim = opposite(mover);
  const keyFrom = squareIndex(key.from);
  const keyTo = squareIndex(key.to);
  const moved = b.get(keyTo);
  const targets = moved ? worthAttacking(b, keyTo, moved.role, victim) : [];

  let rear: StoryPiece | undefined;
  for (const [ys, y] of before.board) {
    if (y.color !== mover || !SLIDERS.has(y.role) || ys === keyFrom || b.get(ys)?.role !== y.role) continue;
    const opened = (ts: Square): boolean =>
      between(ys, ts).has(keyFrom) && !attacks(y, ys, before.board.occupied).has(ts);
    const hit = worthAttacking(b, ys, y.role, victim, opened);
    if (hit.length === 0) continue;
    rear = { square: makeSquare(ys), piece: y.role, color: mover };
    for (const t of hit) if (!targets.some((x) => x.square === t.square)) targets.push(t);
    break;
  }
  return { targets: targets.slice(0, 4), ...(rear ? { rear } : {}) };
}

/** What the story's key move is and what it hits. */
interface KeyRead {
  line: "punish" | "better";
  index: number;
  detail: MoveDetail;
  targets: StoryPiece[];
  rear?: StoryPiece;
}

/**
 * The key move of a line (`steps`, replayed from `fen`): the first move of the line's first
 * mover that hits at least two worthwhile pieces or opens a line from a slider behind it (a
 * fork or a discovered attack, as in Bxf7+ Kxf7 Ng5+), else the line's first move. Undefined
 * for an empty line.
 */
function keyOf(fen: string, steps: readonly Step[], line: KeyRead["line"]): KeyRead | undefined {
  if (steps.length === 0) return undefined;
  let first: KeyRead | undefined;
  for (let i = 0; i < steps.length; i += 2) {
    const before = positionFromFen(i === 0 ? fen : steps[i - 1]!.detail.fenAfter);
    const detail = steps[i]!.detail;
    const read = readKeyMove(before, detail);
    const k: KeyRead = { line, index: i, detail, ...read };
    if (read.targets.length >= 2 || read.rear) return k;
    first ??= k;
  }
  return first;
}

const squareIndex = (name: string): Square => (name.charCodeAt(0) - 97) + 8 * (name.charCodeAt(1) - 49);

/**
 * Why the better line was better, by the first rule that holds:
 * 1. `mates`: the best line mates;
 * 2. `wins`: it wins at least `TACTIC_MIN_GAIN` pawns, naming the piece won and the piece given;
 * 3. `covers-square`: the key move is the opponent's immediate reply (`punish[0]`), it is still
 *    legal after the better move, and the player can then legally capture on its square and
 *    wins there by exchange count;
 * 4. `stops-key-move`: the key move is `punish[0]` and is no longer legal after the better move,
 *    while its destination is empty or holds the player's piece;
 * 5. `holds`: the best line keeps the material level or better.
 */
function betterReasonOf(
  player: Color,
  best: ReturnType<typeof lineOutcome>,
  better: readonly Step[],
  key: KeyRead | undefined,
): BetterReason | undefined {
  if (best.mate === "for") return { kind: "mates", mateIn: Math.ceil(best.plies / 2) };
  if (best.gain >= TACTIC_MIN_GAIN) {
    const won = biggestLoss(better, opposite(player));
    const gave = biggestLoss(better, player);
    return {
      kind: "wins",
      ...(won ? { square: won.square, piece: won.piece } : {}),
      ...(gave ? { gave: gave.piece } : {}),
      gain: best.gain,
    };
  }
  if (key && key.line === "punish" && key.index === 0 && better[0]) {
    const pos = positionFromFen(better[0].detail.fenAfter);
    const k = key.detail;
    const m = legalMove(pos, k.uci);
    if (m) {
      pos.play(m);
      const to = squareIndex(k.to);
      const canTake = [...pos.allDests()].some(([, dests]) => dests.has(to));
      const won = see(pos.board, to, player);
      if (canTake && won > 0) return { kind: "covers-square", square: k.to, piece: k.piece, gain: won };
    } else {
      const there = pos.board.get(squareIndex(k.to));
      if (!there || there.color === player) return { kind: "stops-key-move", square: k.to, piece: k.piece };
    }
  }
  if (best.gain >= 0) return { kind: "holds", gain: best.gain };
  return undefined;
}

/**
 * The story of one finding, built only from the stored analysis by replaying its lines with
 * legal-move rules (no engine call). A game whose moves carry a deeper check is expected to be
 * resolved to the checked values before it is passed in; the lines are read the same way.
 *
 * - `played` is the finding's move; `actualReply` the game's next move, if any.
 * - `punish` is the engine's answer to the move, read over the plies the detectors score the
 *   played line on (`lineOutcome`) and cut after its last capture, promotion, check or mate;
 *   empty when that stretch has none. `better` is the engine's line cut the same way, at least
 *   one ply, and empty when the move played was the engine's choice. Both stop cleanly at the
 *   first illegal move and keep at most `STORY_LINE_MAX_PLIES`.
 * - `key` names the move `targets`, `rear` and the square reasons refer to (see `keyOf`). For
 *   the "missed" patterns it is taken from `better` (the player's own shot), otherwise from
 *   `punish`; from the other line when that one is empty.
 * - `gain` and `betterGain` are the player's material change from before the move to the end
 *   of the played move plus `punish`, and to the end of `better`.
 * - `lost` is the player's most valuable piece taken in `punish`, only when `gain` is negative.
 *
 * Undefined when the finding is for another game, its ply is not in the game, or the stored
 * move is not legal in its own position.
 */
export function storyOf(
  g: PlayerGame,
  finding: Pick<PatternFinding, "gameId" | "ply"> & Partial<Pick<PatternFinding, "patternId">>,
): ExampleStory | undefined {
  if (finding.gameId !== g.analysis.gameId) return undefined;
  const move = moveAt(g, finding.ply);
  if (!move) return undefined;
  const player = move.color;
  const start = positionFromFen(move.fenBefore);
  const playedMove = legalMove(start, move.uci);
  if (!playedMove) return undefined;
  const afterPlayed = start.clone();
  const played = playStep(afterPlayed, playedMove).detail;

  const answer = answerTo(g, move) ?? [];
  const playedLine = lineOutcome(move.fenBefore, [move.uci, ...answer].slice(0, BEST_LINE_MAX_PLIES), player);
  const punishWindow = Math.min(playedLine.plies - 1, STORY_LINE_MAX_PLIES);
  const punishPos = afterPlayed.clone();
  const punish = cutAtLastEvent(replay(punishPos, answer, punishWindow), 0);
  const gain = materialChange(start.board, punishPos.board, player);
  const lost = gain < 0 ? biggestLoss(punish, player) : undefined;

  const reply = replyTo(g, move);
  const actualReply = reply ? moveDetail(move.fenAfter, reply.uci) : undefined;
  const replyFound = !!reply && answer.length > 0 && reply.uci === answer[0];

  const bestLine = move.bestLine ?? (move.bestUci ? [move.bestUci] : []);
  const bestIsPlayed = bestLine[0] === move.uci;
  const best = lineOutcome(move.fenBefore, bestLine, player);
  const betterPos = start.clone();
  const better = bestIsPlayed
    ? []
    : cutAtLastEvent(replay(betterPos, bestLine, Math.min(Math.max(best.plies, 1), STORY_LINE_MAX_PLIES)), 1);
  const betterGain = better.length > 0 ? materialChange(start.board, betterPos.board, player) : undefined;

  const fromPunish = (): KeyRead | undefined => keyOf(move.fenAfter, punish, "punish");
  const fromBetter = (): KeyRead | undefined => keyOf(move.fenBefore, better, "better");
  const missed = finding.patternId !== undefined && blindSpotFamilyOf(finding.patternId) === "missed";
  const key = missed ? (fromBetter() ?? fromPunish()) : (fromPunish() ?? fromBetter());
  const betterReason = better.length > 0 ? betterReasonOf(player, best, better, key) : undefined;

  return {
    played,
    punish: punish.map((s) => s.detail),
    replyFound,
    ...(actualReply ? { actualReply } : {}),
    better: better.map((s) => s.detail),
    ...(key ? { key: { line: key.line, index: key.index } } : {}),
    targets: key?.targets ?? [],
    ...(key?.rear ? { rear: key.rear } : {}),
    ...(lost ? { lost } : {}),
    gain,
    ...(betterGain !== undefined ? { betterGain } : {}),
    ...(betterReason ? { betterReason } : {}),
    winPctBefore: move.winPctBefore,
    winPctAfter: move.winPctAfter,
    depth: move.check?.depth ?? g.analysis.engine.depth,
  };
}
