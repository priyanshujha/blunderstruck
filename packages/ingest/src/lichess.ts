import { GameRecord, type TimeClass } from "@blunderstruck/contracts";
import { type FetchOptions, get, userAgent } from "./http";

const SPEED: Record<string, TimeClass> = {
  ultraBullet: "bullet",
  bullet: "bullet",
  blitz: "blitz",
  rapid: "rapid",
  classical: "classical",
  correspondence: "daily",
};

/** Statuses where no real game was played. */
const SKIP_STATUS = new Set(["created", "started", "aborted", "noStart", "unknownFinish", "cheat"]);

/* eslint-disable @typescript-eslint/no-explicit-any -- raw platform JSON */
export function normalizeLichess(g: any): GameRecord | null {
  if (g?.variant !== "standard" || SKIP_STATUS.has(g.status) || !g.pgn) return null;
  const timeClass = SPEED[g.speed];
  const white = g.players?.white?.user?.name;
  const black = g.players?.black?.user?.name;
  // Games against the built-in AI or anonymous opponents carry no user: skip them.
  if (!timeClass || !white || !black) return null;
  const timeControl = g.clock
    ? `${g.clock.initial}+${g.clock.increment}`
    : g.daysPerTurn
      ? `${g.daysPerTurn}d`
      : "-";
  return GameRecord.parse({
    id: `lichess:${g.id}`,
    platform: "lichess",
    url: `https://lichess.org/${g.id}`,
    playedAt: new Date(g.createdAt).toISOString(),
    rated: Boolean(g.rated),
    timeClass,
    timeControl,
    white: { name: white, rating: g.players.white.rating },
    black: { name: black, rating: g.players.black.rating },
    result: g.winner === "white" || g.winner === "black" ? g.winner : "draw",
    termination: g.status,
    opening: g.opening ? { eco: g.opening.eco, name: g.opening.name } : undefined,
    pgn: g.pgn,
  });
}

export async function fetchLichessGames(
  username: string,
  opts: FetchOptions = {},
): Promise<GameRecord[]> {
  const params = new URLSearchParams({
    max: String(opts.max ?? 50),
    pgnInJson: "true",
    clocks: "true",
    opening: "true",
    finished: "true",
  });
  if (opts.since) params.set("since", String(opts.since.getTime()));
  const token = opts.lichessToken ?? process.env.LICHESS_TOKEN;
  const res = await get(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`,
    {
      Accept: "application/x-ndjson",
      "User-Agent": userAgent(opts.contact),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    opts.fetchImpl,
  );
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => normalizeLichess(JSON.parse(line)))
    .filter((g): g is GameRecord => g !== null);
}
