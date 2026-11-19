import { describe, expect, it } from "vitest";
import { perspective } from "@blunderstruck/contracts";
import { fetchChesscomGames, normalizeChesscom, normalizeLichess } from "./index";

const PGN = '[Event "x"]\n[ECO "C50"]\n[ECOUrl "https://www.chess.com/openings/Italian-Game"]\n\n1. e4 e5 1-0';

const lichessRaw = {
  id: "abcd1234",
  rated: true,
  variant: "standard",
  speed: "blitz",
  status: "resign",
  createdAt: 1763500000000,
  players: {
    white: { user: { name: "Alice" }, rating: 1500 },
    black: { user: { name: "Bob" }, rating: 1480 },
  },
  winner: "black",
  opening: { eco: "B01", name: "Scandinavian Defense" },
  clock: { initial: 180, increment: 2 },
  pgn: PGN,
};

const chesscomRaw = (over: Record<string, unknown> = {}) => ({
  url: "https://www.chess.com/game/live/123",
  uuid: "u-1",
  pgn: PGN,
  time_control: "600",
  end_time: 1763500000,
  rated: true,
  time_class: "rapid",
  rules: "chess",
  white: { username: "Alice", rating: 900, result: "win" },
  black: { username: "Bob", rating: 910, result: "checkmated" },
  ...over,
});

describe("normalizeLichess", () => {
  it("maps a finished standard game", () => {
    const g = normalizeLichess(lichessRaw)!;
    expect(g).toMatchObject({
      id: "lichess:abcd1234",
      timeClass: "blitz",
      timeControl: "180+2",
      result: "black",
      termination: "resign",
    });
    expect(perspective(g, "alice")).toMatchObject({ color: "white", outcome: "loss", rating: 1500 });
  });

  it("skips variants, aborted games and games without two users", () => {
    expect(normalizeLichess({ ...lichessRaw, variant: "chess960" })).toBeNull();
    expect(normalizeLichess({ ...lichessRaw, status: "aborted" })).toBeNull();
    expect(
      normalizeLichess({ ...lichessRaw, players: { ...lichessRaw.players, black: { aiLevel: 3 } } }),
    ).toBeNull();
  });
});

describe("normalizeChesscom", () => {
  it("maps result, termination and opening from the PGN headers", () => {
    expect(normalizeChesscom(chesscomRaw())).toMatchObject({
      id: "chesscom:u-1",
      result: "white",
      termination: "checkmated",
      opening: { eco: "C50", name: "Italian Game" },
      playedAt: "2025-11-18T21:06:40.000Z",
    });
  });

  it("treats a non-win on both sides as a draw and skips variants", () => {
    const draw = chesscomRaw({
      white: { username: "Alice", rating: 900, result: "stalemate" },
      black: { username: "Bob", rating: 910, result: "stalemate" },
    });
    expect(normalizeChesscom(draw)).toMatchObject({ result: "draw", termination: "stalemate" });
    expect(normalizeChesscom(chesscomRaw({ rules: "chess960" }))).toBeNull();
  });
});

describe("fetchChesscomGames", () => {
  it("walks archives newest first, serially, and stops at max and at since", async () => {
    const calls: string[] = [];
    const months: Record<string, unknown[]> = {
      "2025/10": [chesscomRaw({ uuid: "oct", end_time: 1760000000 })],
      "2025/11": [
        chesscomRaw({ uuid: "nov-old", end_time: 1762000000 }),
        chesscomRaw({ uuid: "nov-new", end_time: 1763500000 }),
      ],
    };
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      const body = url.endsWith("/archives")
        ? { archives: Object.keys(months).map((m) => `https://api.chess.com/pub/player/alice/games/${m}`) }
        : { games: months[url.split("/").slice(-2).join("/")] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    const two = await fetchChesscomGames("Alice", { max: 2, fetchImpl });
    expect(two.map((g) => g.id)).toEqual(["chesscom:nov-new", "chesscom:nov-old"]);
    expect(calls.some((u) => u.endsWith("2025/10"))).toBe(false);

    const recent = await fetchChesscomGames("Alice", {
      since: new Date("2025-11-10T00:00:00Z"),
      fetchImpl,
    });
    expect(recent.map((g) => g.id)).toEqual(["chesscom:nov-new"]);
  });
});
