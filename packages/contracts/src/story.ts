import { z } from "zod";
import { Color } from "./game";

/** A board square in algebraic notation, "a1" to "h8". */
export const Square = z.string().regex(/^[a-h][1-8]$/);
export type Square = z.infer<typeof Square>;

export const PieceRole = z.enum(["pawn", "knight", "bishop", "rook", "queen", "king"]);
export type PieceRole = z.infer<typeof PieceRole>;

/** One move, replayed with legal-move rules, with everything a sentence about it needs. */
export const MoveDetail = z.object({
  san: z.string(),
  uci: z.string(),
  from: Square,
  to: Square,
  piece: PieceRole,
  color: Color,
  /** The piece taken, en passant included. */
  captured: PieceRole.optional(),
  check: z.boolean(),
  mate: z.boolean(),
  promotion: PieceRole.optional(),
  castle: z.enum(["king", "queen"]).optional(),
  enPassant: z.literal(true).optional(),
  fenAfter: z.string(),
});
export type MoveDetail = z.infer<typeof MoveDetail>;

/** A piece on a square, as a story names it. */
export const StoryPiece = z.object({ square: Square, piece: PieceRole, color: Color });
export type StoryPiece = z.infer<typeof StoryPiece>;

/** Why the engine's move was better, by the first rule that holds. */
export const BetterReason = z.object({
  kind: z.enum(["mates", "wins", "covers-square", "stops-key-move", "holds"]),
  square: Square.optional(),
  /** The piece won. */
  piece: PieceRole.optional(),
  /** The piece given for it. */
  gave: PieceRole.optional(),
  mateIn: z.number().int().optional(),
  /** Material won, in pawns. */
  gain: z.number().optional(),
});
export type BetterReason = z.infer<typeof BetterReason>;

/** Longest punishing or better line a story keeps, in plies. */
export const STORY_LINE_MAX_PLIES = 8;

/**
 * What happened in an example position, built from the stored engine lines by replay. Read it
 * together with `FocusExample.fen`, the position before `played`. `winPctBefore` and
 * `winPctAfter` are from the mover's (the player's) point of view.
 */
export const ExampleStory = z.object({
  played: MoveDetail,
  /** The engine's answer to the move played, cut after its last capture, check or mate. */
  punish: z.array(MoveDetail).max(STORY_LINE_MAX_PLIES),
  /** The game's actual reply was the engine's answer: `followed >= 1`. */
  replyFound: z.boolean(),
  /** The move actually played next in the game, if any. */
  actualReply: MoveDetail.optional(),
  /**
   * How many leading plies of `punish` were actually played in the game, in order, starting
   * with the opponent's reply: 0 when the reply was another move or the game ended there. Every
   * move of `punish` from this index on is what the engine shows, not what was played. `better`
   * is never played. Absent on stories stored before the field existed.
   */
  followed: z.number().int().nonnegative().optional(),
  /** The engine's preferred line instead of the move played, cut the same way. */
  better: z.array(MoveDetail).max(STORY_LINE_MAX_PLIES),
  /**
   * The key move of the story: `punish[index]` or `better[index]`. `targets`, `rear` and the
   * `covers-square` and `stops-key-move` reasons refer to this move. When absent, readers treat
   * `punish[0]` as the key move.
   */
  key: z
    .object({ line: z.enum(["punish", "better"]), index: z.number().int().nonnegative() })
    .optional(),
  /** Pieces the key move attacked. */
  targets: z.array(StoryPiece).max(4),
  /** The piece behind a discovered attack made by the key move. */
  rear: StoryPiece.optional(),
  /** The player's piece that was lost. */
  lost: StoryPiece.optional(),
  /** The most valuable enemy piece won for `lost`; absent when it went for nothing or pawns only. */
  lostFor: PieceRole.optional(),
  /**
   * The capture of `lost` was played in the game: it is within the first `followed` plies of
   * `punish`. Says nothing about the rest of the game.
   */
  lostInGame: z.boolean().optional(),
  /** Material balance change for the player along `punish`, in pawns. */
  gain: z.number(),
  /** Material balance change for the player along `better`, in pawns. */
  betterGain: z.number().optional(),
  betterReason: BetterReason.optional(),
  winPctBefore: z.number(),
  winPctAfter: z.number(),
  /** Engine depth the lines come from. */
  depth: z.number().int().nonnegative(),
});
export type ExampleStory = z.infer<typeof ExampleStory>;

/**
 * Sets of patterns that share blind-spot properties. "allowed": the player let the opponent in;
 * "missed": the player had something and did not play it.
 */
export const BLIND_SPOT_FAMILIES = {
  allowed: ["allowed-tactic", "hung-piece", "allowed-mate"],
  missed: ["missed-tactic", "missed-capture", "missed-mate"],
} as const;
export type BlindSpotFamily = keyof typeof BLIND_SPOT_FAMILIES;

/** The blind-spot family of a pattern, or null when the pattern has no blind-spot properties. */
export function blindSpotFamilyOf(patternId: string): BlindSpotFamily | null {
  for (const family of Object.keys(BLIND_SPOT_FAMILIES) as BlindSpotFamily[]) {
    if ((BLIND_SPOT_FAMILIES[family] as readonly string[]).includes(patternId)) return family;
  }
  return null;
}

/** Every blind-spot property. The order is the final tie-break when choosing blind spots. */
export const BLIND_SPOT_IDS = [
  "answer-check",
  "answer-knight-check",
  "answer-fork",
  "answer-discovered",
  "moved-piece-lost",
  "moved-onto-attacked",
  "moved-after-capture",
  "left-after-attack",
  "undefended",
  "lost-knight",
  "lost-bishop",
  "lost-rook",
  "lost-queen",
  "best-check",
  "best-knight",
  "best-capture",
  "best-quiet",
  "takes-last-moved",
  "best-fork",
  "best-discovered",
  "moves-1-10",
  "moves-11-20",
  "moves-21-30",
  "moves-31-plus",
] as const;
export const BlindSpotId = z.enum(BLIND_SPOT_IDS);
export type BlindSpotId = z.infer<typeof BlindSpotId>;

/**
 * How a property is read. "line": by replaying the stored engine line, exact given that line.
 * "motif": by the motif rules, a heuristic ("looked like a fork").
 */
export const BlindSpotBasis = z.enum(["line", "motif"]);
export type BlindSpotBasis = z.infer<typeof BlindSpotBasis>;

export interface BlindSpotInfo {
  id: BlindSpotId;
  /** The pattern set the property applies to; "both" applies to either set. */
  family: BlindSpotFamily | "both";
  /** Set on a child property: never selected on its own, only attached to this selected parent. */
  parent?: BlindSpotId;
  basis: BlindSpotBasis;
}

const info = (
  id: BlindSpotId,
  family: BlindSpotInfo["family"],
  opts: { parent?: BlindSpotId; basis?: BlindSpotBasis } = {},
): BlindSpotInfo => ({
  id,
  family,
  ...(opts.parent ? { parent: opts.parent } : {}),
  basis: opts.basis ?? "line",
});

/** Every blind-spot property with its family, parent and basis, in `BLIND_SPOT_IDS` order. */
export const BLIND_SPOTS: readonly BlindSpotInfo[] = Object.freeze([
  info("answer-check", "allowed"),
  info("answer-knight-check", "allowed", { parent: "answer-check" }),
  info("answer-fork", "allowed", { basis: "motif" }),
  info("answer-discovered", "allowed", { basis: "motif" }),
  info("moved-piece-lost", "allowed"),
  info("moved-onto-attacked", "allowed", { parent: "moved-piece-lost" }),
  info("moved-after-capture", "allowed", { parent: "moved-piece-lost" }),
  info("left-after-attack", "allowed"),
  info("undefended", "allowed"),
  info("lost-knight", "allowed"),
  info("lost-bishop", "allowed"),
  info("lost-rook", "allowed"),
  info("lost-queen", "allowed"),
  info("best-check", "missed"),
  info("best-knight", "missed", { parent: "best-check" }),
  info("best-capture", "missed"),
  info("best-quiet", "missed"),
  info("takes-last-moved", "missed"),
  info("best-fork", "missed", { basis: "motif" }),
  info("best-discovered", "missed", { basis: "motif" }),
  info("moves-1-10", "both"),
  info("moves-11-20", "both"),
  info("moves-21-30", "both"),
  info("moves-31-plus", "both"),
]);

/** A property's entry in `BLIND_SPOTS`, or undefined for an id this version does not know. */
export function blindSpotInfo(id: string): BlindSpotInfo | undefined {
  return BLIND_SPOTS.find((s) => s.id === id);
}

/** Most blind spots a focus item shows, and so most habit steps. */
export const MAX_BLIND_SPOTS = 3;

/**
 * A property of a pattern's occurrences that is much more common there than among the player's
 * other mistakes. `id` stays a plain string so stored reports from other versions still parse.
 */
export const BlindSpot = z.object({
  id: z.string(),
  basis: BlindSpotBasis,
  /** The pattern's occurrences with the property. */
  count: z.number().int().nonnegative(),
  /** Games those occurrences are in. */
  games: z.number().int().nonnegative(),
  /** The pattern's occurrences in the window. */
  of: z.number().int().nonnegative(),
  /**
   * Every countable mistake of the player in the window with the property, this pattern's own
   * occurrences included. So `baselineCount >= count` normally holds, but it is not guaranteed
   * for patterns that count moves which are not countable mistakes. Show the baseline as a share
   * of all the player's mistakes ("of your mistakes overall"), never of "other" mistakes.
   */
  baselineCount: z.number().int().nonnegative(),
  /** Every countable mistake of the player in the window, this pattern's own included. */
  baselineOf: z.number().int().nonnegative(),
  /** A child property that holds for enough of these occurrences. */
  refinement: z.object({ id: z.string(), count: z.number().int().nonnegative() }).optional(),
  examples: z.array(z.object({ gameId: z.string(), ply: z.number().int().positive() })).max(2),
});
export type BlindSpot = z.infer<typeof BlindSpot>;

/** The games blind spots were computed over. */
export const BlindSpotWindow = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  games: z.number().int().nonnegative(),
  mistakes: z.number().int().nonnegative(),
});
export type BlindSpotWindow = z.infer<typeof BlindSpotWindow>;

/** One practice step for one blind spot. `text` is a token template (`BLIND_SPOT_TOKENS`). */
export const HabitStep = z.object({ blindSpot: z.string(), text: z.string() });
export type HabitStep = z.infer<typeof HabitStep>;
