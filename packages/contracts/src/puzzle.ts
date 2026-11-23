import { z } from "zod";
import { BEST_LINE_MAX_PLIES } from "./analysis";
import { type PatternId, TacticMotif } from "./coach";
import { Color } from "./game";

/**
 * Puzzles for self-study, cut from a player's own analysed games.
 *
 * - `do-over`: the position before the player's mistake, the player to move. Find what
 *   should have been played instead.
 * - `punish`: the position after the player's mistake, the opponent to move (the board is
 *   seen from the opponent's side). Find the move that makes the mistake pay.
 *
 * Each puzzle is one move to find; the engine's line is shown after the answer.
 */
export const PuzzleKind = z.enum(["do-over", "punish"]);
export type PuzzleKind = z.infer<typeof PuzzleKind>;

/** Bump when the rules that pick or check puzzles change, so older candidates can be rebuilt. */
export const PUZZLE_VERSION = 1;

/** Most moves a puzzle may accept as correct; more than this and the position is too open. */
export const PUZZLE_MAX_ACCEPTED = 4;

/** A move given both ways: UCI for checking, SAN for reading. */
export const PuzzleMove = z.object({ uci: z.string(), san: z.string() });
export type PuzzleMove = z.infer<typeof PuzzleMove>;

/**
 * The deterministic id of a candidate: `${gameId}~${ply}~${kind}`. The same game, ply and
 * kind always give the same id, so rebuilding candidates never duplicates one.
 */
export function puzzleCandidateId(gameId: string, ply: number, kind: PuzzleKind): string {
  return `${gameId}~${ply}~${kind}`;
}

/** One puzzle built from one move of one analysed game. */
export const PuzzleCandidate = z.object({
  /** `puzzleCandidateId(gameId, ply, kind)`. */
  id: z.string(),
  kind: PuzzleKind,
  gameId: z.string(),
  /** Ply of the player's mistake in the game (the same ply as the `PatternFinding`). */
  ply: z.number().int().positive(),
  /** The pattern the mistake was counted under. */
  patternId: z.string(),
  motif: TacticMotif.optional(),
  /** The position to solve: `fenBefore` of the mistake for a do-over, `fenAfter` for a punish. */
  fen: z.string(),
  /** Side to move in `fen`, who solves the puzzle. */
  solver: Color,
  /** Every move (UCI) the engine rates close enough to the best to count as solved. */
  accepted: z.array(z.string()).min(1).max(PUZZLE_MAX_ACCEPTED),
  /** Engine main line from `fen` (UCI), shown after the answer. */
  line: z.array(z.string()).max(BEST_LINE_MAX_PLIES),
  /** The mistake the player made in the game at `ply`. */
  played: PuzzleMove,
  /**
   * The move played just before `fen`: for a do-over the opponent's move at ply - 1, for a
   * punish the mistake itself (equal to `played`). Absent when `fen` is the start position.
   */
  prevMove: PuzzleMove.optional(),
  /** The opponent's actual answer in the game, at ply + 1. Absent when the game ended there. */
  reply: PuzzleMove.optional(),
  /** Win-probability points the mistake cost the player. */
  winPctLoss: z.number(),
  /** Engine settings the accepted set was computed with. `lines` is the MultiPV count. */
  engine: z.object({
    name: z.string(),
    depth: z.number().int().positive(),
    lines: z.number().int().positive(),
  }),
  puzzleVersion: z.number().int().positive(),
});
export type PuzzleCandidate = z.infer<typeof PuzzleCandidate>;

/** Lichess puzzle theme keys a pattern can be practised with (lichess.org/training/<theme>). */
export const PUZZLE_THEMES = [
  "mateIn1",
  "mateIn2",
  "defensiveMove",
  "hangingPiece",
  "fork",
  "discoveredAttack",
  "pin",
  "skewer",
  "capturingDefender",
  "deflection",
  "crushing",
  "endgame",
  "opening",
] as const;
export type PuzzleTheme = (typeof PUZZLE_THEMES)[number];

/** Which puzzle themes train each pattern. `time-trouble` is not a position, so it has none. */
export const PATTERN_PUZZLE_THEMES: Record<PatternId, readonly PuzzleTheme[]> = {
  "missed-mate": ["mateIn1", "mateIn2"],
  "allowed-mate": ["defensiveMove", "mateIn2"],
  "hung-piece": ["hangingPiece"],
  "allowed-tactic": ["defensiveMove", "fork", "discoveredAttack", "pin", "skewer"],
  "missed-capture": ["hangingPiece", "capturingDefender"],
  "missed-tactic": ["fork", "discoveredAttack", "pin", "skewer", "deflection"],
  "thrown-win": ["crushing", "endgame"],
  "time-trouble": [],
  "opening-trouble": ["opening"],
};

/** The puzzle theme closest to each recognised tactic motif. */
const MOTIF_THEME: Record<TacticMotif, PuzzleTheme> = {
  fork: "fork",
  "discovered-attack": "discoveredAttack",
  mate: "mateIn2",
};

/**
 * Themes for one pattern, narrowed by its motif where that helps: an `allowed-tactic` with a
 * known motif trains `defensiveMove` plus that motif's theme. Every other case returns the
 * pattern's full list.
 */
export function puzzleThemesFor(patternId: PatternId, motif?: TacticMotif): readonly PuzzleTheme[] {
  if (patternId === "allowed-tactic" && motif) return ["defensiveMove", MOTIF_THEME[motif]];
  return PATTERN_PUZZLE_THEMES[patternId];
}
