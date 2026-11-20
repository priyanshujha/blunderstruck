import { BLIND_SPOTS, type BlindSpotFamily } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { moveAt } from "./game";
import { fixtureGame } from "./test-fixtures";
import { phaseTrait, traitsOf } from "./traits";
import type { PlayerGame } from "./types";

const fenPgn = (fen: string, moves: string): string => `[Event "fixture"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n${moves} *`;

/*
 * Every scripted engine line below was checked with Stockfish 19 at depth 18
 * (`cli eval "<fen>" --depth 18`); the lines are its principal variation, cut short.
 */

/** F1: allowed fork. Best h1e1 (+7.78); after Qd2 Black is +2.83 with Ne4+ Ke1 Nxd2 Kxd2 Re8. */
const F1 = () =>
  fixtureGame({
    pgn: fenPgn("r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1", "1. Qd2 Ne4+"),
    as: "white",
    evals: {
      1: { cp: 778, pv: ["h1e1"] },
      2: { cp: -283, pv: ["f6e4", "f2e1", "e4d2", "e1d2", "f8e8"] },
    },
  });

/** F2: hung after a capture. 3.Nxe5? (best Bb5, +0.43) Nxe5 (Black +4.01, then Nc3 Ng6). */
const F2 = (id?: string, before = 43) =>
  fixtureGame({
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Nxe5 Nxe5",
    as: "white",
    ...(id ? { id } : {}),
    evals: {
      5: { cp: before, pv: ["f1b5"] },
      6: { cp: -401, pv: ["c6e5", "b1c3", "e5g6"] },
    },
  });

/** F3: missed fork. Black is +2.83 with Ne4+ Ke1 Nxd2 Kxd2; ...h6 lets White to +7.63. */
const F3 = () =>
  fixtureGame({
    pgn: fenPgn("r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1", "1... h6"),
    as: "black",
    evals: {
      2: { cp: -283, pv: ["f6e4", "f2e1", "e4d2", "e1d2"] },
      3: { cp: 763, pv: ["h1e1"] },
    },
  });

/** 3...b5 attacks the bishop on c4 (defended by d3); 4.h3? leaves it: bxc4 dxc4 Nc6 Nf3 (Black +7.22). */
const LEFT_AFTER_ATTACK = () =>
  fixtureGame({
    pgn: "1. e4 e5 2. Bc4 Nf6 3. d3 b5 4. h3 bxc4",
    as: "white",
    evals: { 8: { cp: -722, pv: ["b5c4", "d3c4", "b8c6", "g1f3"] } },
  });

/** 1.Rc3? (best Kg1, -0.09) walks into Nxc3+, a discovered check from b7: Kg1 Nxa2 f4 (Black +7.64). */
const DISCOVERED = () =>
  fixtureGame({
    pgn: fenPgn("6k1/pb3ppp/8/3n4/8/6P1/PP3P1P/2R4K w - - 0 1", "1. Rc3 Nxc3+"),
    as: "white",
    evals: {
      1: { cp: -9, pv: ["h1g1"] },
      2: { cp: -764, pv: ["d5c3", "h1g1", "c3a2", "f2f4"] },
    },
  });

/** 2...Qh4?? puts the queen where the f3 knight takes it: best 3.Nxh4 d5 Nf5 (+9.20); played 3.d3. */
const QUEEN_LEFT = () =>
  fixtureGame({
    pgn: "1. e4 e5 2. Nf3 Qh4 3. d3",
    as: "white",
    evals: { 5: { cp: 920, pv: ["f3h4", "d7d5", "h4f5"] } },
  });

/** The starting position: best 1.e4 c5 Nf3 (+0.37), a quiet move; played 1.f3. */
const QUIET = () =>
  fixtureGame({ pgn: "1. f3", as: "white", evals: { 1: { cp: 37, pv: ["e2e4", "c7c5", "g1f3"] } } });

/** Best 1.Nf5+, a discovered check from b2 hitting the queen: Kg8 Nxe7+ Kf7 (+2.76); played 1.h3. */
const MISSED_DISCOVERED = () =>
  fixtureGame({
    pgn: fenPgn("r6k/pp2q2p/8/8/3N4/8/PB3PPP/6K1 w - - 0 1", "1. h3"),
    as: "white",
    evals: { 1: { cp: 276, pv: ["d4f5", "h8g8", "f5e7", "g8f7"] } },
  });

const traitsAt = (g: PlayerGame, ply: number, family: BlindSpotFamily) => traitsOf(g, moveAt(g, ply)!, family);

describe("traitsOf: the allowed family", () => {
  it("F1 (allowed fork)", async () => {
    expect(traitsAt(await F1(), 1, "allowed")).toEqual([
      "answer-check",
      "answer-knight-check",
      "answer-fork",
      "moved-piece-lost",
      "undefended",
      "lost-queen",
      "moves-1-10",
    ]);
  });

  it("F2 (hung after a capture), with no check", async () => {
    const t = traitsAt(await F2(), 5, "allowed");
    expect(t).toEqual([
      "moved-piece-lost",
      "moved-onto-attacked",
      "moved-after-capture",
      "undefended",
      "lost-knight",
      "moves-1-10",
    ]);
    expect(t).not.toContain("answer-check");
  });

  it("a piece left where the opponent's last move attacked it, still defended", async () => {
    expect(traitsAt(await LEFT_AFTER_ATTACK(), 7, "allowed")).toEqual(["left-after-attack", "lost-bishop", "moves-1-10"]);
  });

  it("a discovered check that is not a knight check, taking a defended rook", async () => {
    expect(traitsAt(await DISCOVERED(), 1, "allowed")).toEqual([
      "answer-check",
      "answer-discovered",
      "moved-piece-lost",
      "moved-onto-attacked",
      "lost-rook",
      "moves-1-10",
    ]);
  });

  it("a move with no engine answer has only its move-number band", async () => {
    const g = await fixtureGame({ pgn: "1. a3", as: "white" });
    expect(traitsAt(g, 1, "allowed")).toEqual(["moves-1-10"]);
  });
});

describe("traitsOf: the missed family", () => {
  it("F3 (missed fork)", async () => {
    expect(traitsAt(await F3(), 2, "missed")).toEqual(["best-check", "best-knight", "best-fork", "moves-1-10"]);
  });

  it("a capture of the piece the opponent just moved", async () => {
    expect(traitsAt(await QUEEN_LEFT(), 5, "missed")).toEqual(["best-capture", "takes-last-moved", "moves-1-10"]);
  });

  it("a quiet best move", async () => {
    expect(traitsAt(await QUIET(), 1, "missed")).toEqual(["best-quiet", "moves-1-10"]);
  });

  it("a discovered check whose knight does not give the check itself", async () => {
    expect(traitsAt(await MISSED_DISCOVERED(), 1, "missed")).toEqual(["best-check", "best-discovered", "moves-1-10"]);
  });

  it("reports only ids of the family asked for", async () => {
    const g = await F1();
    const missed = new Set(BLIND_SPOTS.filter((s) => s.family !== "allowed").map((s) => s.id as string));
    for (const id of traitsAt(g, 1, "missed")) expect(missed.has(id)).toBe(true);
    // Best was Re1: quiet.
    expect(traitsAt(g, 1, "missed")).toEqual(["best-quiet", "moves-1-10"]);
  });
});

describe("phaseTrait", () => {
  it.each([
    [1, "moves-1-10"],
    [20, "moves-1-10"],
    [21, "moves-11-20"],
    [40, "moves-11-20"],
    [41, "moves-21-30"],
    [60, "moves-21-30"],
    [61, "moves-31-plus"],
    [200, "moves-31-plus"],
  ])("ply %i is %s", (ply, id) => {
    expect(phaseTrait(ply)).toBe(id);
  });

  it("traitsOf reads the band from the move's ply", async () => {
    const g = await QUIET();
    const m = moveAt(g, 1)!;
    expect(traitsOf(g, { ...m, ply: 41 }, "missed")).toContain("moves-21-30");
    expect(traitsOf(g, { ...m, ply: 41 }, "missed")).not.toContain("moves-1-10");
  });
});

describe("every blind-spot id", () => {
  it("holds in at least one position above and fails in another of its family", async () => {
    // The "allowed" facts read the next ply (the engine's answer), so only "missed" reads move
    // the ply to reach the later move-number bands.
    const read = (g: PlayerGame, ply: number, family: BlindSpotFamily, asPly = ply) =>
      ({ family, traits: traitsOf(g, { ...moveAt(g, ply)!, ply: asPly }, family) as string[] });
    const [f1, f2, f3, left, disc, queen, quiet, missedDisc] = await Promise.all([
      F1(), F2(), F3(), LEFT_AFTER_ATTACK(), DISCOVERED(), QUEEN_LEFT(), QUIET(), MISSED_DISCOVERED(),
    ]);
    const reads = [
      read(f1, 1, "allowed"),
      read(f2, 5, "allowed"),
      read(left, 7, "allowed"),
      read(disc, 1, "allowed"),
      read(f1, 1, "missed", 21),
      read(f3, 2, "missed"),
      read(queen, 5, "missed"),
      read(quiet, 1, "missed", 61),
      read(missedDisc, 1, "missed", 41),
    ];
    for (const { id, family } of BLIND_SPOTS) {
      const relevant = reads.filter((r) => family === "both" || r.family === family);
      expect({ id, positive: relevant.some((r) => r.traits.includes(id)) }).toEqual({ id, positive: true });
      expect({ id, negative: relevant.some((r) => !r.traits.includes(id)) }).toEqual({ id, negative: true });
    }
  });
});
