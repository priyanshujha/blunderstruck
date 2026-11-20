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
import { lineLoss } from "./lost";
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
 * fork or a discovered attack, as in Bxf7+ Kxf7 Ng5+), else the line's first move. The search
 * ends at the mover's capture of the most valuable piece it wins in the line, and before any
 * move made when the mover is already `TACTIC_MIN_GAIN` pawns ahead: the tactic is over by then.
 * Undefined for an empty line.
 */
function keyOf(fen: string, steps: readonly Step[], line: KeyRead["line"]): KeyRead | undefined {
  if (steps.length === 0) return undefined;
  const mover = steps[0]!.detail.color;
  const startMaterial = material(positionFromFen(fen).board, mover);
  let decisive = steps.length - 1;
  let biggest = 0;
  steps.forEach((s, i) => {
    const c = s.detail.captured;
    if (s.detail.color === mover && c && PIECE_VALUES[c] > biggest) {
      biggest = PIECE_VALUES[c];
      decisive = i;
    }
  });
  let first: KeyRead | undefined;
  for (let i = 0; i <= decisive; i += 2) {
    if (i > 0 && material(positionFromFen(steps[i - 1]!.detail.fenAfter).board, mover) - startMaterial >= TACTIC_MIN_GAIN) break;
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
 *
 * Rules 3 and 4 are skipped when they would credit the better move with something it did not
 * do: the key move lands on the square of the piece just played, the better move gives check,
 * the key move captures in one position and not in the other, or the player already wins back
 * on that square later in the punishing line.
 */
function betterReasonOf(
  player: Color,
  best: ReturnType<typeof lineOutcome>,
  better: readonly Step[],
  key: KeyRead | undefined,
  played: MoveDetail,
  punish: readonly Step[],
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
  const k = key?.line === "punish" && key.index === 0 ? key.detail : undefined;
  const fair =
    !!k &&
    !!better[0] &&
    k.to !== played.to &&
    !better[0].detail.check &&
    !punish.slice(1).some((s) => s.detail.color === player && s.detail.to === k.to && !!s.detail.captured);
  if (k && fair) {
    const pos = positionFromFen(better[0]!.detail.fenAfter);
    const m = legalMove(pos, k.uci);
    const there = pos.board.get(squareIndex(k.to));
    if (m) {
      const capturesNow = !!playStep(pos.clone(), m).detail.captured;
      pos.play(m);
      const to = squareIndex(k.to);
      const canTake = [...pos.allDests()].some(([, dests]) => dests.has(to));
      const won = see(pos.board, to, player);
      if (capturesNow === !!k.captured && canTake && won > 0) {
        return { kind: "covers-square", square: k.to, piece: k.piece, gain: won };
      }
    } else if ((!there || there.color === player) && !!there === !!k.captured) {
      return { kind: "stops-key-move", square: k.to, piece: k.piece };
    }
  }
  if (best.gain >= 0) return { kind: "holds", gain: best.gain };
  return undefined;
}

/** A capture onto `square`. */
const capturesOn = (d: MoveDetail, square: string): boolean => !!d.captured && d.to === square;

/**
 * The next few moves the game itself played after the player's move, and whether the game took
 * what the move allowed (`paid`). `moves` is the game's continuation read over the plies
 * `lineOutcome` scores it on (the window), cut after the last capture, promotion, check or
 * mate, keeping at least the first ply played. `ended` says the last kept move is the game's
 * last move.
 *
 * The paid stretch is found by the first rule that applies:
 * 1. the game played `punish` through its last capture, promotion or mate (the plies `gain`
 *    counts), the punishing line was not cut by `STORY_LINE_MAX_PLIES`, and the game's next ply
 *    does not recapture on a square taken on in those plies;
 * 2. `punish` ends in mate and the game mated the player within as many plies;
 * 3. the opponent's very next move took the piece `lost` names on its square, and the run of
 *    captures on that square ended within `STORY_LINE_MAX_PLIES` plies;
 * 4. the game played the first move of `punish`, the player replied with a quiet move that
 *    did not move the piece `lost` names, and the opponent's next move took that piece on the
 *    square it stood on after the move; the captures there ended within the plies kept.
 * The stretch is `paid` when it contains the player being mated, or when the player's net loss
 * over it, and over every game ply replayed (up to `BEST_LINE_MAX_PLIES`), is at least 1 and
 * at least what the engine's line costs
 * (`-gain`): a game that won the material back is never told as having cost it. `mated` is set
 * when `punish` ends in mate and the game's mate falls inside the stretch. `net`, `lost`,
 * `lostFor` and `exchange` are `lineLoss` over the move and the paid stretch, set only when paid.
 */
function gameAfter(
  g: PlayerGame,
  ply: number,
  fenBefore: string,
  uci: string,
  afterPlayed: Chess,
  player: Color,
  engine: { punish: readonly Step[]; followed: number; capped: boolean; gain: number; lost?: StoryPiece },
): NonNullable<ExampleStory["inGame"]> {
  const actual = g.analysis.moves.filter((m) => m.ply > ply).map((m) => m.uci);
  const game = replay(afterPlayed.clone(), actual, BEST_LINE_MAX_PLIES);
  const scored = lineOutcome(fenBefore, [uci, ...actual].slice(0, BEST_LINE_MAX_PLIES), player);
  const window = Math.min(scored.plies - 1, STORY_LINE_MAX_PLIES);
  const moves = cutAtLastEvent(game.slice(0, window), 1);
  const ended = moves.length === actual.length;
  const notPaid = { moves: moves.map((s) => s.detail), ended, paid: false };

  const { punish, followed, lost } = engine;
  const paidPlies = paidStretch(game, afterPlayed, player, punish, followed, engine.capped, lost);
  if (paidPlies === undefined) return notPaid;

  const stretch = game.slice(0, paidPlies);
  const mateIn = stretch.findIndex((s) => s.detail.mate && s.detail.color !== player);
  const loss = lineLoss(fenBefore, [uci, ...stretch.map((s) => s.detail.uci)], player);
  if (mateIn === -1) {
    const need = Math.max(1, -engine.gain);
    // Every ply replayed, not just the window: a piece won back shortly after is seen.
    const whole = lineLoss(fenBefore, [uci, ...game.map((s) => s.detail.uci)], player);
    if (loss.net < need || whole.net < need) return notPaid;
  }
  const mated = mateIn !== -1 && punish.length > 0 && punish[punish.length - 1]!.detail.mate;
  return {
    moves: moves.map((s) => s.detail),
    ended,
    paid: true,
    ...(mated ? { mated: true } : {}),
    net: loss.net,
    ...(loss.piece ? { lost: loss.piece } : {}),
    ...(loss.for ? { lostFor: loss.for } : {}),
    ...(loss.exchange ? { exchange: true } : {}),
  };
}

/** The number of game plies the rules of `gameAfter` attribute to the move, or undefined. */
function paidStretch(
  game: readonly Step[],
  afterPlayed: Chess,
  player: Color,
  punish: readonly Step[],
  followed: number,
  capped: boolean,
  lost: StoryPiece | undefined,
): number | undefined {
  // 1. The engine's line, played through what it counts.
  let last = -1;
  punish.forEach((s, i) => {
    if (s.detail.captured || s.detail.promotion || s.detail.mate) last = i;
  });
  if (last >= 0 && followed > last && !capped) {
    const squares = punish.slice(0, last + 1).filter((s) => s.detail.captured).map((s) => s.detail.to);
    const next = game[last + 1]?.detail;
    if (!next || !squares.some((sq) => capturesOn(next, sq))) return last + 1;
  }
  // 2. A mate allowed, and a mate played.
  if (punish.length > 0 && punish[punish.length - 1]!.detail.mate) {
    const mate = game.slice(0, punish.length).findIndex((s) => s.detail.mate && s.detail.color !== player);
    if (mate !== -1) return mate + 1;
  }
  if (!lost) return undefined;
  // 3. The piece taken at once, by any piece.
  if (game[0] && capturesOn(game[0].detail, lost.square) && game[0].detail.captured === lost.piece) {
    let run = 0;
    while (run < game.length && capturesOn(game[run]!.detail, lost.square)) run++;
    return run <= STORY_LINE_MAX_PLIES ? run : undefined;
  }
  // 4. The punishing move played, the player replied, and the next move took the unmoved piece.
  const key = punish[0]?.detail;
  const [first, reply, take] = [game[0]?.detail, game[1]?.detail, game[2]?.detail];
  if (!key || !first || !reply || !take || first.uci !== key.uci) return undefined;
  // Nothing taken elsewhere on the way: the cost is only what goes on the piece's square.
  if (first.captured || reply.captured || reply.from === lost.square) return undefined;
  const there = afterPlayed.board.get(squareIndex(lost.square));
  if (there?.color !== player || there.role !== lost.piece) return undefined;
  if (!capturesOn(take, lost.square) || take.captured !== lost.piece) return undefined;
  let end = 2;
  while (end < game.length && capturesOn(game[end]!.detail, lost.square)) end++;
  return end <= STORY_LINE_MAX_PLIES ? end : undefined;
}

/**
 * The story of one finding, built only from the stored analysis by replaying its lines with
 * legal-move rules (no engine call). A game whose moves carry a deeper check is expected to be
 * resolved to the checked values before it is passed in; the lines are read the same way.
 *
 * - `played` is the finding's move; `actualReply` the game's next move, if any. `followed` is
 *   how many leading plies of `punish` the game actually played; `replyFound` is
 *   `followed >= 1`. Past `followed`, `punish` is the engine's line, not the game. `better` is
 *   never played.
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
 * - `lost` and `lostFor` are the piece the played move and `punish` cost the player and what
 *   was won for it, by `lineLoss`: what the move allowed, by the engine's line.
 * - `inGame` is the next few moves the game really played (see `gameAfter`), for every
 *   pattern; it states a cost only when the game took what the move allowed (`paid`).
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
  const loss = lineLoss(move.fenBefore, [move.uci, ...punish.map((s) => s.detail.uci)], player);
  const lost = loss.piece;

  const reply = replyTo(g, move);
  const actualReply = reply ? moveDetail(move.fenAfter, reply.uci) : undefined;
  // The game's moves after the played one, compared ply by ply with `punish`.
  let followed = 0;
  while (followed < punish.length && moveAt(g, move.ply + 1 + followed)?.uci === punish[followed]!.detail.uci) followed++;
  const replyFound = followed >= 1;
  const inGame = gameAfter(g, move.ply, move.fenBefore, move.uci, afterPlayed, player, {
    punish,
    followed,
    capped: playedLine.plies - 1 > STORY_LINE_MAX_PLIES,
    gain,
    ...(lost ? { lost } : {}),
  });

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
  const betterReason = better.length > 0 ? betterReasonOf(player, best, better, key, played, punish) : undefined;

  return {
    played,
    punish: punish.map((s) => s.detail),
    replyFound,
    ...(actualReply ? { actualReply } : {}),
    better: better.map((s) => s.detail),
    ...(key ? { key: { line: key.line, index: key.index } } : {}),
    targets: key?.targets ?? [],
    ...(key?.rear ? { rear: key.rear } : {}),
    followed,
    ...(lost ? { lost } : {}),
    ...(loss.for ? { lostFor: loss.for } : {}),
    gain,
    ...(betterGain !== undefined ? { betterGain } : {}),
    ...(betterReason ? { betterReason } : {}),
    inGame,
    winPctBefore: move.winPctBefore,
    winPctAfter: move.winPctAfter,
    depth: move.check?.depth ?? g.analysis.engine.depth,
  };
}
