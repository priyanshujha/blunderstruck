import { PATTERN_IDS, type PatternId, type PuzzleCandidate, type PuzzleKind, puzzleThemesFor } from "@blunderstruck/contracts";
import { uciToSan } from "@blunderstruck/patterns";

const KIND_LABEL: Record<PuzzleKind, string> = { "do-over": "Do-over", punish: "Punish it" };

/** What each kind asks of the solver, in one line. */
const KIND_TASK: Record<PuzzleKind, string> = {
  "do-over": "find what you should have played here",
  punish: "find the move that makes the opponent's mistake pay",
};

const isPatternId = (id: string): id is PatternId => (PATTERN_IDS as readonly string[]).includes(id);

/**
 * Where to look at a position on Lichess's analysis board: `/analysis/<FEN>` with each space
 * written as an underscore. The board faces the side to move.
 */
export function lichessAnalysisUrl(fen: string, solver: "white" | "black"): string {
  const path = fen.trim().split(/\s+/).join("_");
  return `https://lichess.org/analysis/${path}${solver === "black" ? "?color=black" : ""}`;
}

/** A Lichess puzzle theme's training page. */
export const lichessTrainingUrl = (theme: string): string => `https://lichess.org/training/${theme}`;

export interface PuzzleFormatOptions {
  /** Most candidates to print. */
  max: number;
  /** The patterns to link Lichess training themes for, in order: the focus items, else those found. */
  patterns: readonly string[];
  /** What `patterns` are, for the heading: "your focus items" or "the patterns found". */
  patternsLabel: string;
}

function candidateBlock(c: PuzzleCandidate, n: number): string[] {
  const side = c.solver === "white" ? "White" : "Black";
  const accepted = c.accepted.map((u) => uciToSan(c.fen, u)).join(", ");
  return [
    `${n}. ${KIND_LABEL[c.kind]}: ${c.patternId}, game ${c.gameId}, ply ${c.ply}`,
    `   ${side} to move: ${KIND_TASK[c.kind]}`,
    `   FEN: ${c.fen}`,
    `   Accepted: ${accepted}`,
    `   You played: ${c.played.san}`,
    `   Analyse on Lichess: ${lichessAnalysisUrl(c.fen, c.solver)}`,
  ];
}

/**
 * The text `puzzles` prints: each candidate (up to `max`) with its position, the moves that
 * solve it, the move played and an analysis link, then Lichess training links for the patterns.
 */
export function formatPuzzles(player: string, candidates: readonly PuzzleCandidate[], opts: PuzzleFormatOptions): string {
  const shown = candidates.slice(0, opts.max);
  const out: string[] = [];
  if (shown.length === 0) {
    out.push(`No puzzles from ${player}'s games: no position was clear enough to keep.`);
  } else {
    const more = candidates.length > shown.length ? ` (${candidates.length - shown.length} more with --max)` : "";
    out.push(`${shown.length} puzzle${shown.length === 1 ? "" : "s"} from ${player}'s own games${more}`);
    for (const [i, c] of shown.entries()) out.push("", ...candidateBlock(c, i + 1));
  }

  const lines: string[] = [];
  const seen = new Set<string>();
  for (const id of opts.patterns) {
    if (seen.has(id)) continue;
    seen.add(id);
    const themes = isPatternId(id) ? puzzleThemesFor(id) : [];
    // An unknown id (from another version) or time-trouble has no position to practise.
    if (themes.length === 0) continue;
    lines.push(`   ${id}`, ...themes.map((t) => `     ${t}: ${lichessTrainingUrl(t)}`));
  }
  if (lines.length > 0) out.push("", `Practise ${opts.patternsLabel} on Lichess:`, ...lines);
  return out.join("\n");
}
