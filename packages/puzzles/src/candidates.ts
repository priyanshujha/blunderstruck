import type {
  AnalyzedGame,
  AnalyzedMove,
  Color,
  PatternFinding,
  PuzzleKind,
  PuzzleMove,
  TacticMotif,
} from "@blunderstruck/contracts";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { squareRank } from "chessops/util";
import {
  MAX_PER_GAME,
  MAX_PER_RUN,
  enoughLegalMoves,
  plyAllowed,
  positionKey,
  puzzleKindsFor,
} from "./rules";

/** A position to test as a puzzle, before the engine has looked at it. */
export interface PuzzlePosition {
  kind: PuzzleKind;
  gameId: string;
  /** Ply of the player's mistake. */
  ply: number;
  patternId: string;
  motif?: TacticMotif;
  /** `fenBefore` of the mistake for a do-over, `fenAfter` for a punish. */
  fen: string;
  /** Side to move in `fen`. */
  solver: Color;
  /** The mistake as played. */
  played: PuzzleMove;
  /** The move just before `fen`: the previous move for a do-over, the mistake for a punish. */
  prevMove?: PuzzleMove;
  /** The opponent's actual next move after the mistake, if the game went on. */
  reply?: PuzzleMove;
  /** Win% points the mistake cost, as counted in the finding. */
  winPctLoss: number;
}

const other = (c: Color): Color => (c === "white" ? "black" : "white");
const moveOf = (m: AnalyzedMove | undefined): PuzzleMove | undefined => (m ? { uci: m.uci, san: m.san } : undefined);

/**
 * Number of legal moves in a position, counting each promotion piece as its own move.
 * Undefined when the FEN is not a legal position.
 */
export function legalMoveCount(fen: string): number | undefined {
  try {
    const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    let n = 0;
    for (const [from, dests] of pos.allDests()) {
      const pawn = pos.board.getRole(from) === "pawn";
      for (const to of dests) {
        const rank = squareRank(to);
        n += pawn && (rank === 0 || rank === 7) ? 4 : 1;
      }
    }
    return n;
  } catch {
    return undefined;
  }
}

/**
 * Every position the findings point at, one per finding and puzzle kind, in the order of the
 * findings. Findings whose game or ply is missing from `games` are skipped.
 */
export function puzzlePositions(
  games: readonly AnalyzedGame[],
  findings: readonly PatternFinding[],
): PuzzlePosition[] {
  const byGame = new Map<string, Map<number, AnalyzedMove>>();
  for (const g of games) byGame.set(g.gameId, new Map(g.moves.map((m) => [m.ply, m])));
  const out: PuzzlePosition[] = [];
  for (const f of findings) {
    const moves = byGame.get(f.gameId);
    const move = moves?.get(f.ply);
    if (!moves || !move) continue;
    const reply = moveOf(moves.get(f.ply + 1));
    for (const kind of puzzleKindsFor(f.patternId)) {
      const played = { uci: move.uci, san: move.san };
      const base = {
        kind,
        gameId: f.gameId,
        ply: f.ply,
        patternId: f.patternId,
        ...(f.motif ? { motif: f.motif } : {}),
        played,
        ...(reply ? { reply } : {}),
        winPctLoss: f.winPctLoss,
      };
      if (kind === "do-over") {
        const prevMove = moveOf(moves.get(f.ply - 1));
        out.push({ ...base, fen: move.fenBefore, solver: move.color, ...(prevMove ? { prevMove } : {}) });
      } else {
        out.push({ ...base, fen: move.fenAfter, solver: other(move.color), prevMove: played });
      }
    }
  }
  return out;
}

export interface SelectOptions {
  /** When each game was played (ISO time), by game id. Games without one count as oldest. */
  playedAt?: Readonly<Record<string, string>>;
  /** Called for each position left out, with the reason. */
  onSkip?: (position: PuzzlePosition, reason: string) => void;
}

/**
 * The positions worth sending to the engine: late enough, not forced, each position once, at
 * most `MAX_PER_GAME` from a game and `MAX_PER_RUN` in all. Most recent game first, then the
 * costliest mistake; ties fall back to game id, ply and kind, so the order is always the same.
 */
export function selectPositions(positions: readonly PuzzlePosition[], opts: SelectOptions = {}): PuzzlePosition[] {
  const time = (p: PuzzlePosition): number => {
    const t = opts.playedAt?.[p.gameId];
    const ms = t === undefined ? Number.NaN : Date.parse(t);
    return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
  };
  const sorted = [...positions].sort(
    (a, b) =>
      time(b) - time(a) ||
      b.winPctLoss - a.winPctLoss ||
      (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0) ||
      a.ply - b.ply ||
      (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0),
  );
  const skip = (p: PuzzlePosition, reason: string) => opts.onSkip?.(p, reason);
  const seen = new Set<string>();
  const perGame = new Map<string, number>();
  const out: PuzzlePosition[] = [];
  for (const p of sorted) {
    if (!plyAllowed(p.patternId, p.ply)) {
      skip(p, "too early in the game");
      continue;
    }
    const legal = legalMoveCount(p.fen);
    if (legal === undefined) {
      skip(p, "not a legal position");
      continue;
    }
    if (!enoughLegalMoves(legal)) {
      skip(p, "too few legal moves");
      continue;
    }
    const key = positionKey(p.fen);
    if (seen.has(key)) {
      skip(p, "same position already chosen");
      continue;
    }
    const n = perGame.get(p.gameId) ?? 0;
    if (n >= MAX_PER_GAME) {
      skip(p, "enough puzzles from this game");
      continue;
    }
    if (out.length >= MAX_PER_RUN) {
      skip(p, "enough positions for one run");
      continue;
    }
    seen.add(key);
    perGame.set(p.gameId, n + 1);
    out.push(p);
  }
  return out;
}
