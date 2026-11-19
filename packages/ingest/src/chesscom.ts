import { GameRecord, TimeClass } from "@blunderstruck/contracts";
import { type FetchOptions, get, userAgent } from "./http";

const header = (pgn: string, name: string): string | undefined =>
  new RegExp(`\\[${name} "([^"]*)"\\]`).exec(pgn)?.[1];

/* eslint-disable @typescript-eslint/no-explicit-any -- raw platform JSON */
export function normalizeChesscom(g: any): GameRecord | null {
  if (g?.rules !== "chess" || !g.pgn || !g.white?.username || !g.black?.username) return null;
  const timeClass = TimeClass.safeParse(g.time_class);
  if (!timeClass.success) return null;
  const result =
    g.white.result === "win" ? "white" : g.black.result === "win" ? "black" : "draw";
  // The non-winning side's code says how it ended: checkmated, resigned, timeout, stalemate, ...
  const termination = result === "white" ? g.black.result : g.white.result;
  const id = g.uuid ?? String(g.url).split("/").pop();
  // ECOUrl ends in a slug such as ".../openings/Italian-Game-Two-Knights-Defense".
  const openingName = header(g.pgn, "ECOUrl")?.split("/").pop()?.replace(/-/g, " ");
  const eco = header(g.pgn, "ECO");
  return GameRecord.parse({
    id: `chesscom:${id}`,
    platform: "chesscom",
    url: g.url,
    playedAt: new Date(g.end_time * 1000).toISOString(),
    rated: Boolean(g.rated),
    timeClass: timeClass.data,
    timeControl: String(g.time_control),
    white: { name: g.white.username, rating: g.white.rating },
    black: { name: g.black.username, rating: g.black.rating },
    result,
    termination,
    opening: eco || openingName ? { eco, name: openingName } : undefined,
    pgn: g.pgn,
  });
}

/** ".../games/2026/11" -> first instant of the following month (exclusive upper bound). */
function archiveEnd(url: string): Date {
  const [year, month] = url.split("/").slice(-2).map(Number);
  return new Date(Date.UTC(year!, month!, 1));
}

export async function fetchChesscomGames(
  username: string,
  opts: FetchOptions = {},
): Promise<GameRecord[]> {
  const max = opts.max ?? 50;
  const headers = { Accept: "application/json", "User-Agent": userAgent(opts.contact) };
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`;
  const { archives } = (await (
    await get(`${base}/games/archives`, headers, opts.fetchImpl)
  ).json()) as { archives: string[] };

  const out: GameRecord[] = [];
  // Newest month first, one request at a time: Chess.com rate-limits parallel requests.
  for (const url of [...archives].reverse()) {
    if (opts.since && archiveEnd(url) <= opts.since) break;
    const { games } = (await (await get(url, headers, opts.fetchImpl)).json()) as {
      games: unknown[];
    };
    for (const raw of [...games].reverse()) {
      const game = normalizeChesscom(raw);
      if (!game) continue;
      if (opts.since && new Date(game.playedAt) < opts.since) continue;
      out.push(game);
      if (out.length >= max) return out;
    }
  }
  return out;
}
