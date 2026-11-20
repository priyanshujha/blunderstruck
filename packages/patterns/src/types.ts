import type {
  AnalyzedGame,
  Color,
  PatternId,
  TacticMotif,
} from "@blunderstruck/contracts";

/** One analysed game seen from the player's side. Built by `toPlayerGame`. */
export interface PlayerGame {
  /** Full-game analysis: every ply, both colours, current `ANALYSIS_VERSION`. */
  analysis: AnalyzedGame;
  color: Color;
  outcome: "win" | "loss" | "draw";
  /** From the time control. Absent for daily or correspondence games and unreadable controls. */
  clock?: { baseSeconds: number; incrementSeconds: number };
  /** How the game ended, platform-native ("mate", "resign", "outoftime", "timeout", ...). */
  termination?: string;
  /** From the game record, for display only. */
  opening?: { eco?: string; name?: string };
}

/** What a detector reports; `findPatterns` turns hits into `PatternFinding`s. */
export interface DetectorHit {
  gameId: string;
  /** Ply of the player's move the finding is about. */
  ply: number;
  /** Win-probability points the move cost (usually the move's own `winPctLoss`). */
  winPctLoss: number;
  /** Short machine-written fact, e.g. "knight on e4 left en prise (-3), taken by Qxe4". */
  evidence: string;
  /**
   * What the hit is about, for the one-count-per-streak rule: a hit on the player's next move
   * from the same detector with the same subject is not counted again. Leave it out when every
   * move stands on its own.
   */
  subject?: string;
  /** Only on `allowed-tactic` and `missed-tactic`. */
  motif?: TacticMotif;
}

/**
 * "tactical": what went wrong on the move; at most one tactical finding per move, the earliest
 * in `PATTERN_IDS` wins. "context": the situation the move was made in; may share a move.
 */
export type DetectorFamily = "tactical" | "context";

/** Looks at one game at a time. */
export interface GameDetector {
  id: PatternId;
  scope: "game";
  family: DetectorFamily;
  detect(g: PlayerGame): DetectorHit[];
}

/** Needs the whole set of games at once (e.g. a position that recurs across games). */
export interface SetDetector {
  id: PatternId;
  scope: "set";
  family: "context";
  detect(gs: readonly PlayerGame[]): DetectorHit[];
}

export type Detector = GameDetector | SetDetector;
