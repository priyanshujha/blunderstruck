import type { AnalyzedMove } from "@blunderstruck/contracts";
import { classifyMotif, compareLines, type LineOutcome, lineToSan, moveLabel } from "../board";
import { answerTo, playerMoves, replyTo } from "../game";
import { isCountable, TACTIC_MIN_GAIN } from "../rules";
import type { DetectorHit, GameDetector, PlayerGame } from "../types";

/** A countable move whose best and played lines differ by the tactic swing. */
export interface TacticRead {
  move: AnalyzedMove;
  reply?: AnalyzedMove;
  /** The engine's answer to the move (`answerTo`): the reply's `bestLine`, or `finalLine` after the last move. */
  answer: readonly string[];
  /** The engine's line from `move.fenBefore`, scored for the mover. */
  best: LineOutcome;
  /** The played move plus the engine's answer to it, scored for the mover. */
  played: LineOutcome;
}

/**
 * Shared by the three tactic detectors: the countable gate, `compareLines` (which scores a mate
 * anywhere in either line), and the swing condition. Undefined when any of them fails.
 */
export function readTactic(g: PlayerGame, move: AnalyzedMove): TacticRead | undefined {
  if (!isCountable(move) || !move.bestLine) return undefined;
  const reply = replyTo(g, move);
  const answer = answerTo(g, move) ?? [];
  const cmp = compareLines(move, reply, answer);
  if (!cmp?.swing) return undefined;
  return { move, ...(reply ? { reply } : {}), answer, best: cmp.best, played: cmp.played };
}

/** The `missed-tactic` predicate on top of `readTactic`: the best line mates or wins at least `TACTIC_MIN_GAIN`. */
export function missesTactic(t: TacticRead): boolean {
  return t.best.mate === "for" || t.best.gain >= TACTIC_MIN_GAIN;
}

/** "Nf7+ Kg8 Nxd8": the first `plies` moves of a UCI line from `fen`, in SAN. */
export function sanLine(fen: string, line: readonly string[], plies: number): string {
  return lineToSan(fen, line.slice(0, Math.max(1, plies))).join(" ");
}

/**
 * `missed-tactic`: a countable move where the tactic swing condition holds and the engine's
 * line mates or wins at least `TACTIC_MIN_GAIN` pawns. `subject` is the best move, so missing
 * the same move on the next turn counts once.
 */
export const missedTactic: GameDetector = {
  id: "missed-tactic",
  scope: "game",
  family: "tactical",
  detect(g) {
    const hits: DetectorHit[] = [];
    for (const m of playerMoves(g)) {
      const t = readTactic(g, m);
      if (!t || !missesTactic(t)) continue;
      const line = sanLine(m.fenBefore, m.bestLine!, t.best.plies);
      const motif = classifyMotif(m.fenBefore, m.bestLine!);
      const what = t.best.mate === "for" ? "mates" : `wins ${t.best.gain}`;
      hits.push({
        gameId: g.analysis.gameId,
        ply: m.ply,
        winPctLoss: m.winPctLoss,
        evidence: `missed ${line}${motif && motif !== "mate" ? ` (${motif})` : ""}, which ${what}; played ${moveLabel(m)}`,
        subject: m.bestUci!,
        ...(motif ? { motif } : {}),
      });
    }
    return hits;
  },
};
