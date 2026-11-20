import { describe, expect, it } from "vitest";
import { fixtureGame } from "../test-fixtures";
import { allowedMate } from "./allowed-mate";

// 1.e4 e5 2.Bc4 Nc6 3.Qh5 reaches r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3.
// Ply 6 is Black's 3rd move: 3...g6 holds (best, +0.23), 3...Nf6?? allows 4.Qxf7#.
const OPENING = "1. e4 e5 2. Bc4 Nc6 3. Qh5";
const BEFORE = { cp: 23, bestMove: "g6" };

describe("allowed-mate", () => {
  it("flags 3...Nf6?? allowing 4.Qxf7#", async () => {
    const g = await fixtureGame({
      pgn: `${OPENING} Nf6 4. Qxf7#`,
      as: "black",
      result: "white",
      evals: { 6: BEFORE, 7: { mate: 1, bestMove: "Qxf7#" } },
    });
    const hits = allowedMate.detect(g);
    expect(hits).toMatchObject([{ ply: 6, evidence: "allowed mate in 1 (Qxf7#)" }]);
    expect(hits[0]!.winPctLoss).toBeGreaterThan(40);
  });

  it("shows the mating line for a mate in 2", async () => {
    const g = await fixtureGame({
      pgn: `${OPENING} Nf6 4. Qe2`,
      as: "black",
      evals: { 6: BEFORE, 7: { mate: 2, pv: ["Qxe5+", "Be7", "Qxc7", "a6"] } },
    });
    // A scripted line, not a real mate: only its first 2n-1 plies are shown.
    expect(allowedMate.detect(g)).toMatchObject([{ ply: 6, evidence: "allowed mate in 2 (Qxe5+ Be7 Qxc7)" }]);
  });

  it("does not flag 3...g6", async () => {
    const g = await fixtureGame({ pgn: `${OPENING} g6`, as: "black", evals: { 6: BEFORE, 7: { cp: 35 } } });
    expect(allowedMate.detect(g)).toEqual([]);
  });

  it("ignores a mate in 3 (beyond MATE_HORIZON)", async () => {
    const g = await fixtureGame({ pgn: `${OPENING} Nf6 4. Qe2`, as: "black", evals: { 6: BEFORE, 7: { mate: 3 } } });
    expect(allowedMate.detect(g)).toEqual([]);
  });

  it("does not flag a player who was already being mated", async () => {
    const g = await fixtureGame({
      pgn: `${OPENING} Nf6 4. Qxf7#`,
      as: "black",
      result: "white",
      evals: { 6: { mate: 2 }, 7: { mate: 1, bestMove: "Qxf7#" } },
    });
    expect(allowedMate.detect(g)).toEqual([]);
  });

  it("does not flag a player already lost on win% (ALREADY_LOST)", async () => {
    const g = await fixtureGame({
      pgn: `${OPENING} Nf6 4. Qxf7#`,
      as: "black",
      result: "white",
      evals: { 6: { cp: 600 }, 7: { mate: 1, bestMove: "Qxf7#" } },
    });
    expect(allowedMate.detect(g)).toEqual([]);
  });

  it("only looks at the player's own moves", async () => {
    const g = await fixtureGame({
      pgn: `${OPENING} Nf6 4. Qxf7#`,
      as: "white",
      result: "white",
      evals: { 6: BEFORE, 7: { mate: 1, bestMove: "Qxf7#" } },
    });
    expect(allowedMate.detect(g)).toEqual([]);
  });
});
