import type { BlindSpotId, PatternFinding } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { blindSpots, chooseBlindSpots, type TraitedMove } from "./blind-spots";
import { moveAt } from "./game";
import { isCountable } from "./rules";
import { fixtureGame } from "./test-fixtures";

const mv = (gameId: string, ply: number, winPctLoss: number, ...traits: BlindSpotId[]): TraitedMove => ({
  gameId,
  ply,
  winPctLoss,
  traits: new Set(traits),
});
/** `n` baseline mistakes, the first `withTrait` of them carrying `trait`. */
const filler = (prefix: string, n: number, spec: [BlindSpotId, number][] = []): TraitedMove[] =>
  Array.from({ length: n }, (_, i) =>
    mv(`${prefix}${i}`, 1, 10, ...spec.filter(([, k]) => i < k).map(([t]) => t)),
  );

const PERIOD = { start: "2026-01-01T00:00:00.000Z", end: "2026-02-12T00:00:00.000Z" };

describe("chooseBlindSpots", () => {
  // 8 occurrences in 5 games against 40 mistakes.
  const occ = [
    mv("g1", 11, 30, "undefended", "answer-check", "moved-piece-lost"),
    mv("g2", 11, 25, "undefended", "answer-check", "moved-piece-lost"),
    mv("g3", 11, 20, "undefended", "answer-check"),
    mv("g4", 11, 40, "undefended"),
    mv("g5", 11, 15, "lost-rook", "answer-check", "lost-queen"),
    mv("g1", 21, 35, "lost-rook", "answer-check", "lost-queen", "moved-piece-lost"),
    mv("g2", 21, 10, "lost-rook", "lost-queen", "moved-piece-lost"),
    mv("g3", 21, 12, "lost-queen"),
  ];
  // undefended in 6 (A), answer-check in 24 (C), lost-rook in 1, nothing else.
  const base = filler("b", 40, [["undefended", 6], ["answer-check", 24], ["lost-rook", 1]]);

  it("applies the count, games, share and lift rules in integers", () => {
    const spots = chooseBlindSpots(occ, base, "allowed");
    // A: 4 in 4 games, 2*4*40 = 320 >= 3*6*8 = 144. Zero baseline (lost-queen): passes.
    // B (lost-rook, 3): rejected on count. C (answer-check, 5): 2*5*40 = 400 < 3*24*8 = 576.
    // moved-piece-lost: 4 occurrences but in 2 games, rejected on games.
    // A and lost-queen tie on count (4) and games (4): table order.
    expect(spots.map((s) => s.id)).toEqual(["undefended", "lost-queen"]);
    expect(spots[0]).toEqual({
      id: "undefended",
      basis: "line",
      count: 4,
      games: 4,
      of: 8,
      baselineCount: 6,
      baselineOf: 40,
      examples: [
        { gameId: "g4", ply: 11 },
        { gameId: "g1", ply: 11 },
      ],
    });
    expect(spots[1]).toMatchObject({ id: "lost-queen", count: 4, games: 4, baselineCount: 0 });
  });

  it("C passes once its baseline is low enough: 400 >= 3*17*8 = 408 fails, 3*16*8 = 384 passes", () => {
    const ids = (k: number) =>
      chooseBlindSpots(occ, filler("b", 40, [["answer-check", k]]), "allowed").map((s) => s.id);
    expect(ids(17)).not.toContain("answer-check");
    expect(ids(16)).toContain("answer-check");
  });

  it("needs at least a quarter of the pattern's occurrences", () => {
    const many = [...occ, ...Array.from({ length: 9 }, (_, i) => mv(`x${i}`, 3, 1))];
    // 17 occurrences: undefended 4*4 = 16 < 17.
    expect(chooseBlindSpots(many, base, "allowed").map((s) => s.id)).not.toContain("undefended");
    const sixteen = many.slice(0, 16);
    expect(chooseBlindSpots(sixteen, base, "allowed").map((s) => s.id)).toContain("undefended");
  });

  it("needs three games: four occurrences in two games are not enough, in three they are", () => {
    const two = [mv("a", 1, 9, "best-capture"), mv("a", 3, 9, "best-capture"), mv("b", 1, 9, "best-capture"), mv("b", 3, 9, "best-capture")];
    expect(chooseBlindSpots(two, [], "missed")).toEqual([]);
    const three = [...two.slice(0, 3), mv("c", 1, 9, "best-capture")];
    expect(chooseBlindSpots(three, [], "missed").map((s) => s.id)).toEqual(["best-capture"]);
  });

  it("orders by count, then games, then table order, and keeps at most three", () => {
    const xs = [
      ...["a", "b", "c", "d"].map((g) => mv(g, 1, 5, "best-quiet", "takes-last-moved", "best-capture", "moves-11-20")),
      mv("e", 1, 5, "best-quiet", "moves-11-20"),
      mv("a", 3, 5, "takes-last-moved"),
    ];
    // best-quiet 5 in 5 games; moves-11-20 5 in 5 games; takes-last-moved 5 in 4; best-capture 4 in 4.
    expect(chooseBlindSpots(xs, [], "missed").map((s) => [s.id, s.count, s.games])).toEqual([
      ["best-quiet", 5, 5],
      ["moves-11-20", 5, 5],
      ["takes-last-moved", 5, 4],
    ]);
  });

  it("never selects a child on its own", () => {
    const xs = ["a", "b", "c", "d"].map((g) => mv(g, 1, 5, "answer-knight-check", "best-knight"));
    expect(chooseBlindSpots(xs, [], "allowed")).toEqual([]);
    expect(chooseBlindSpots(xs, [], "missed")).toEqual([]);
  });

  it("attaches a child with at least 3 occurrences and a third of the parent's, else none", () => {
    const parent = (n: number, withChild: number) =>
      Array.from({ length: n }, (_, i) =>
        mv(`g${i}`, 1, 5, "answer-check", ...(i < withChild ? (["answer-knight-check"] as const) : [])),
      );
    expect(chooseBlindSpots(parent(9, 3), [], "allowed")[0]).toMatchObject({
      id: "answer-check",
      refinement: { id: "answer-knight-check", count: 3 },
    });
    // 3 of 10 is under a third.
    expect(chooseBlindSpots(parent(10, 3), [], "allowed")[0]).not.toHaveProperty("refinement");
    // 2 is under the minimum even though 2 of 4 is over a third.
    expect(chooseBlindSpots(parent(4, 2), [], "allowed")[0]).not.toHaveProperty("refinement");
  });

  it("picks the child with more occurrences, then the earlier one in the table", () => {
    const xs = (afterCapture: number) =>
      Array.from({ length: 6 }, (_, i) =>
        mv(`g${i}`, 1, 5, "moved-piece-lost", ...(i < 3 ? (["moved-onto-attacked"] as const) : []), ...(i < afterCapture ? (["moved-after-capture"] as const) : [])),
      );
    expect(chooseBlindSpots(xs(3), [], "allowed")[0]!.refinement).toEqual({ id: "moved-onto-attacked", count: 3 });
    expect(chooseBlindSpots(xs(4), [], "allowed")[0]!.refinement).toEqual({ id: "moved-after-capture", count: 4 });
  });

  it("allows a baseline count below the pattern's count (occurrences that are not countable mistakes)", () => {
    const xs = ["a", "b", "c", "d"].map((g) => mv(g, 1, 5, "best-check"));
    const spots = chooseBlindSpots(xs, filler("b", 10, [["best-check", 2]]), "missed");
    expect(spots).toMatchObject([{ id: "best-check", count: 4, of: 4, baselineCount: 2, baselineOf: 10 }]);
  });

  it("takes examples from different games only, largest loss first", () => {
    const xs = [mv("a", 1, 50, "best-check"), mv("a", 3, 40, "best-check"), mv("b", 1, 20, "best-check"), mv("c", 1, 20, "best-check")];
    // b and c tie on loss: game id order.
    expect(chooseBlindSpots(xs, [], "missed")[0]!.examples).toEqual([
      { gameId: "a", ply: 1 },
      { gameId: "b", ply: 1 },
    ]);
  });
});

/** F2 (3.Nxe5? Nxe5, checked at depth 18): moved-piece-lost, moved-onto-attacked, moved-after-capture, undefended, lost-knight. */
const hung = (id: string, before = 43) =>
  fixtureGame({
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Nxe5 Nxe5",
    as: "white",
    id,
    evals: { 5: { cp: before, pv: ["f1b5"] }, 6: { cp: -401, pv: ["c6e5", "b1c3", "e5g6"] } },
  });
/** 1.a3, scripted as a countable mistake with a quiet answer: only its move-number band. */
const quiet = (id: string) =>
  fixtureGame({ pgn: "1. a3 e5", as: "white", id, evals: { 1: { cp: 30, pv: ["e2e4"] }, 2: { cp: -150, pv: ["e7e5"] } } });

const finding = (gameId: string, ply: number, winPctLoss: number): PatternFinding => ({
  patternId: "hung-piece",
  gameId,
  ply,
  winPctLoss,
  evidence: "knight on e5 left en prise (-3), taken by Nxe5",
  subject: "knight e5",
});

describe("blindSpots", () => {
  const setup = async () => {
    const games = await Promise.all([
      ...["h1", "h2", "h3", "h4"].map((id) => hung(id)),
      ...["q1", "q2", "q3", "q4", "q5", "q6"].map((id) => quiet(id)),
    ]);
    const findings = [finding("h1", 5, 30), finding("h2", 5, 40), finding("h3", 5, 50), finding("h4", 5, 20)];
    return { games, findings };
  };

  it("selects from the window's games, with the baseline over every countable mistake", async () => {
    const { games, findings } = await setup();
    for (const g of games) expect(isCountable(moveAt(g, g.analysis.gameId.startsWith("h") ? 5 : 1)!)).toBe(true);
    const r = blindSpots(games, findings, "hung-piece", PERIOD);
    expect(r.window).toEqual({ ...PERIOD, games: 10, mistakes: 10 });
    // moves-1-10 holds for all 10 mistakes: 2*4*10 = 80 < 3*10*4 = 120, not selected.
    expect(r.spots).toEqual([
      {
        id: "moved-piece-lost",
        basis: "line",
        count: 4,
        games: 4,
        of: 4,
        baselineCount: 4,
        baselineOf: 10,
        refinement: { id: "moved-onto-attacked", count: 4 },
        examples: [
          { gameId: "h3", ply: 5 },
          { gameId: "h2", ply: 5 },
        ],
      },
      expect.objectContaining({ id: "undefended", count: 4, baselineCount: 4 }),
      expect.objectContaining({ id: "lost-knight", count: 4, baselineCount: 4 }),
    ]);
  });

  it("counts an occurrence that is not a countable mistake in the pattern only", async () => {
    const { games, findings } = await setup();
    // From an already lost position (-4.01 before the move): not countable.
    const lost = await hung("h5", -401);
    expect(isCountable(moveAt(lost, 5)!)).toBe(false);
    const r = blindSpots([...games, lost], [...findings, finding("h5", 5, 1)], "hung-piece", PERIOD);
    expect(r.window).toMatchObject({ games: 11, mistakes: 10 });
    expect(r.spots[0]).toMatchObject({ id: "moved-piece-lost", count: 5, games: 5, of: 5, baselineCount: 4, baselineOf: 10 });
  });

  it("does not depend on the order of games or findings, and ignores duplicates and other games", async () => {
    const { games, findings } = await setup();
    const a = blindSpots(games, findings, "hung-piece", PERIOD);
    const shuffled = [games[7]!, games[2]!, games[9]!, games[0]!, games[5]!, games[3]!, games[8]!, games[1]!, games[6]!, games[4]!];
    const extra = [findings[3]!, finding("elsewhere", 5, 99), findings[1]!, findings[0]!, findings[2]!, findings[1]!];
    expect(blindSpots([...shuffled, games[0]!], extra, "hung-piece", PERIOD)).toEqual(a);
  });

  it("returns no spots for patterns outside the two families, but still counts the window", async () => {
    const { games, findings } = await setup();
    const r = blindSpots(games, findings.map((f) => ({ ...f, patternId: "time-trouble" })), "time-trouble", PERIOD);
    expect(r).toEqual({ spots: [], window: { ...PERIOD, games: 10, mistakes: 10 } });
  });

  it("an empty window gives nothing", () => {
    expect(blindSpots([], [], "allowed-tactic", PERIOD)).toEqual({ spots: [], window: { ...PERIOD, games: 0, mistakes: 0 } });
  });

  it("two occurrences in two games select nothing", async () => {
    const { games, findings } = await setup();
    const r = blindSpots(games.slice(0, 2).concat(games.slice(4)), findings.slice(0, 2), "hung-piece", PERIOD);
    expect(r.spots).toEqual([]);
  });
});
