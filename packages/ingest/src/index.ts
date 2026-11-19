import type { GameRecord, Platform } from "@blunderstruck/contracts";
import { fetchChesscomGames } from "./chesscom";
import { fetchLichessGames } from "./lichess";
import type { FetchOptions } from "./http";

export { fetchChesscomGames, normalizeChesscom } from "./chesscom";
export { fetchLichessGames, normalizeLichess } from "./lichess";
export { IngestError, type FetchOptions } from "./http";

/** Most recent finished standard games for one account, newest first. */
export function fetchGames(
  platform: Platform,
  username: string,
  opts: FetchOptions = {},
): Promise<GameRecord[]> {
  return platform === "lichess"
    ? fetchLichessGames(username, opts)
    : fetchChesscomGames(username, opts);
}
