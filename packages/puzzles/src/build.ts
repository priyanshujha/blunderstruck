import {
  type AnalyzedGame,
  BEST_LINE_MAX_PLIES,
  PUZZLE_VERSION,
  type PatternFinding,
  type PuzzleCandidate,
  puzzleCandidateId,
} from "@blunderstruck/contracts";
import type { EvalResult, Evaluator } from "@blunderstruck/engine";
import { acceptedSet } from "./accept";
import { type PuzzlePosition, legalMoveCount, puzzlePositions, selectPositions } from "./candidates";
import { PUZZLE_DEPTH, PUZZLE_LINES, acceptedSetAllowed } from "./rules";

/** The evaluator cannot search several lines at once, which the accepted set needs. */
export class MultiPvUnsupportedError extends Error {
  constructor(name: string) {
    super(`the evaluator "${name}" cannot search several lines (no evaluateMulti), so no puzzles can be built`);
    this.name = "MultiPvUnsupportedError";
  }
}

export interface BuildPuzzlesOptions {
  games: readonly AnalyzedGame[];
  findings: readonly PatternFinding[];
  /**
   * One evaluator, or several to search positions side by side. A Stockfish process takes one
   * search at a time, so each running search gets its own evaluator from this list.
   */
  evaluator: Evaluator | readonly Evaluator[];
  /** Search depth. Default `PUZZLE_DEPTH`. */
  depth?: number;
  /** Lines searched per position (MultiPV). Default `PUZZLE_LINES`. */
  lines?: number;
  /** Most searches running at once; never more than the evaluators given. Default 4. */
  concurrency?: number;
  /** When each game was played (ISO time), by game id: the most recent games come first. */
  playedAt?: Readonly<Record<string, string>>;
  /** Called for each position left out, with the reason. */
  onSkip?: (position: PuzzlePosition, reason: string) => void;
}

/**
 * Turns a player's analysed games and pattern findings into puzzles for self-study.
 *
 * Positions are chosen by the rules in `rules.ts`, each is searched with several lines, and a
 * position is kept only when its accepted moves form a closed set that suits its kind. The
 * result is in selection order (most recent game, then costliest mistake), whatever order the
 * searches finish in, and ids are `puzzleCandidateId(gameId, ply, kind)`.
 */
export async function buildPuzzleCandidates(opts: BuildPuzzlesOptions): Promise<PuzzleCandidate[]> {
  const depth = opts.depth ?? PUZZLE_DEPTH;
  const lines = opts.lines ?? PUZZLE_LINES;
  const evaluators: readonly Evaluator[] = Array.isArray(opts.evaluator)
    ? opts.evaluator
    : [opts.evaluator as Evaluator];
  const first = evaluators[0];
  if (!first) throw new RangeError("at least one evaluator is needed");
  for (const e of evaluators) if (!e.evaluateMulti) throw new MultiPvUnsupportedError(e.name);

  const skip = (p: PuzzlePosition, reason: string) => opts.onSkip?.(p, reason);
  const chosen = selectPositions(puzzlePositions(opts.games, opts.findings), {
    ...(opts.playedAt ? { playedAt: opts.playedAt } : {}),
    onSkip: skip,
  });

  const results: (PuzzleCandidate | undefined)[] = new Array(chosen.length);
  const workers = Math.max(1, Math.min(opts.concurrency ?? 4, evaluators.length, chosen.length));
  let next = 0;
  const run = async (evaluator: Evaluator): Promise<void> => {
    while (next < chosen.length) {
      const i = next++;
      const p = chosen[i]!;
      const multi = (await evaluator.evaluateMulti!(p.fen, depth, lines));
      results[i] = judgePosition(p, multi, { name: first.name, depth, lines }, skip);
    }
  };
  await Promise.all(evaluators.slice(0, workers).map(run));
  return results.filter((c): c is PuzzleCandidate => c !== undefined);
}

/**
 * The puzzle a position makes from the engine's lines, or undefined (with the reason passed to
 * `onSkip`) when the accepted set is open or does not suit the puzzle's kind.
 */
export function judgePosition(
  p: PuzzlePosition,
  results: readonly EvalResult[],
  engine: PuzzleCandidate["engine"],
  onSkip?: (position: PuzzlePosition, reason: string) => void,
): PuzzleCandidate | undefined {
  const legal = legalMoveCount(p.fen) ?? 0;
  const set = acceptedSet(results, legal, engine.lines);
  if (!set) {
    onSkip?.(p, "the engine gave no move");
    return undefined;
  }
  if (!set.closed) {
    onSkip?.(p, "too many moves are about as good");
    return undefined;
  }
  if (!acceptedSetAllowed(p.kind, set.accepted, p.played.uci, set.bestWinPct)) {
    onSkip?.(p, p.kind === "do-over" ? "no single clear improvement" : "no clear way to punish it");
    return undefined;
  }
  return {
    id: puzzleCandidateId(p.gameId, p.ply, p.kind),
    kind: p.kind,
    gameId: p.gameId,
    ply: p.ply,
    patternId: p.patternId,
    ...(p.motif ? { motif: p.motif } : {}),
    fen: p.fen,
    solver: p.solver,
    accepted: set.accepted,
    line: set.line.slice(0, BEST_LINE_MAX_PLIES),
    played: p.played,
    ...(p.prevMove ? { prevMove: p.prevMove } : {}),
    ...(p.reply ? { reply: p.reply } : {}),
    winPctLoss: p.winPctLoss,
    engine,
    puzzleVersion: PUZZLE_VERSION,
  };
}
