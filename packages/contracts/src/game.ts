import { z } from "zod";

export const Platform = z.enum(["lichess", "chesscom"]);
export type Platform = z.infer<typeof Platform>;

export const TimeClass = z.enum(["bullet", "blitz", "rapid", "classical", "daily"]);
export type TimeClass = z.infer<typeof TimeClass>;

export const Color = z.enum(["white", "black"]);
export type Color = z.infer<typeof Color>;

export const Player = z.object({
  name: z.string(),
  rating: z.number().int().optional(),
});
export type Player = z.infer<typeof Player>;

/** One finished standard-chess game, normalised across platforms. */
export const GameRecord = z.object({
  /** `${platform}:${platform's own id}` — stable, used as the dedupe key. */
  id: z.string(),
  platform: Platform,
  url: z.string().url(),
  /** ISO 8601, UTC. When the game ended (Chess.com) or started (Lichess). */
  playedAt: z.string().datetime(),
  rated: z.boolean(),
  timeClass: TimeClass,
  /** Platform-native text: "600+5", "180", "1/86400". Display only. */
  timeControl: z.string(),
  white: Player,
  black: Player,
  result: z.enum(["white", "black", "draw"]),
  /** How it ended, platform-native: "mate", "resign", "outoftime", "timeout", ... */
  termination: z.string().optional(),
  opening: z
    .object({ eco: z.string().optional(), name: z.string().optional() })
    .optional(),
  pgn: z.string().min(1),
});
export type GameRecord = z.infer<typeof GameRecord>;

/** The game from one player's side. Returns null when the name is in neither seat. */
export function perspective(
  game: GameRecord,
  username: string,
): { color: Color; outcome: "win" | "loss" | "draw"; rating?: number } | null {
  const u = username.toLowerCase();
  const color: Color | null =
    game.white.name.toLowerCase() === u
      ? "white"
      : game.black.name.toLowerCase() === u
        ? "black"
        : null;
  if (!color) return null;
  const outcome = game.result === "draw" ? "draw" : game.result === color ? "win" : "loss";
  return { color, outcome, rating: game[color].rating };
}
