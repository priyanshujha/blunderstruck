import { describe, expect, it } from "vitest";
import { findPatterns } from "../find";
import { fixtureGame } from "../test-fixtures";
import { allowedTactic } from "./allowed-tactic";
import { hungPiece } from "./hung-piece";
import { missedCapture } from "./missed-capture";
import { missedTactic } from "./missed-tactic";

// Four Knights after 3...Nf6; 4.Ba6?? is ply 7.
const FOUR_KNIGHTS = "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6";

describe("hung-piece", () => {
  it("flags 4.Ba6?? bxa6: the bishop left en prise and taken", async () => {
    const g = await fixtureGame({
      pgn: `${FOUR_KNIGHTS} 4. Ba6 bxa6`,
      as: "white",
      result: "black",
      evals: { 7: { cp: 20, pv: ["Bb5"] }, 8: { cp: -618, pv: ["bxa6"] } },
    });
    const hits = hungPiece.detect(g);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      ply: 7,
      evidence: "bishop on a6 left en prise (-3), taken by bxa6",
      subject: "bishop a6",
    });
    expect(hits[0]!.winPctLoss).toBeGreaterThan(30);
  });

  it("ignores 4.Bc4 when it is the engine's own choice (loses 0), even though ...Nxe4 follows", async () => {
    const g = await fixtureGame({
      pgn: `${FOUR_KNIGHTS} 4. Bc4 Nxe4`,
      as: "white",
      evals: { 7: { cp: 20, pv: ["Bc4"] }, 8: { cp: 11, pv: ["Nxe4"] } },
    });
    expect(g.analysis.moves[6]!.winPctLoss).toBe(0);
    expect(hungPiece.detect(g)).toEqual([]);
  });

  it("subtracts what the move captured: 5.Bxc6 dxc6 is a trade, net 0", async () => {
    const g = await fixtureGame({
      pgn: `${FOUR_KNIGHTS} 4. Bb5 a6 5. Bxc6 dxc6`,
      as: "white",
      // Scripted as a countable mistake so only the net-loss rule can rule it out.
      evals: { 9: { cp: 30, pv: ["O-O"] }, 10: { cp: -200, pv: ["dxc6"] } },
    });
    expect(g.analysis.moves[8]!.winPctLoss).toBeGreaterThanOrEqual(10);
    expect(hungPiece.detect(g)).toEqual([]);
  });

  it("does not count the same blunder from +9 (still winning) or from -5 (already lost)", async () => {
    for (const [before, after] of [
      [900, 500],
      [-500, -1100],
    ] as const) {
      const g = await fixtureGame({
        pgn: `${FOUR_KNIGHTS} 4. Ba6 bxa6`,
        as: "white",
        evals: { 7: { cp: before, pv: ["Bb5"] }, 8: { cp: after, pv: ["bxa6"] } },
      });
      expect(g.analysis.moves[6]!.winPctLoss).toBeGreaterThanOrEqual(10);
      expect(hungPiece.detect(g)).toEqual([]);
    }
  });

  it("counts a piece left hanging on two moves running once", async () => {
    const g = await fixtureGame({
      pgn: `${FOUR_KNIGHTS} 4. Ba6 d6 5. d3 bxa6`,
      as: "white",
      result: "black",
      evals: {
        7: { cp: 20, pv: ["Bb5"] },
        8: { cp: -618, pv: ["bxa6"] },
        9: { cp: 0, pv: ["Bb5"] },
        10: { cp: -618, pv: ["bxa6"] },
      },
    });
    expect(hungPiece.detect(g)).toMatchObject([
      { ply: 7, evidence: "bishop on a6 left en prise (-3), not taken", subject: "bishop a6" },
      { ply: 9, evidence: "bishop on a6 left en prise (-3), taken by bxa6", subject: "bishop a6" },
    ]);
    expect(findPatterns([g], [hungPiece]).map((f) => f.ply)).toEqual([7]);
  });

  it("finds nothing when neither the reply nor the engine's reply takes the piece", async () => {
    const g = await fixtureGame({
      pgn: `${FOUR_KNIGHTS} 4. Ba6 d6`,
      as: "white",
      evals: { 7: { cp: 20, pv: ["Bb5"] }, 8: { cp: -150, pv: ["d6"] } },
    });
    expect(g.analysis.moves[6]!.winPctLoss).toBeGreaterThanOrEqual(10);
    expect(hungPiece.detect(g)).toEqual([]);
  });

  describe("on the game's last move (blunder, then resign)", () => {
    // 3.Qxe5?? gives the queen for a pawn and the game ends there.
    const PGN = "1. e4 e5 2. Qh5 Nc6 3. Qxe5";

    it("uses the engine's final line: hung-piece naming the capture, not allowed-tactic", async () => {
      const g = await fixtureGame({
        pgn: PGN,
        as: "white",
        result: "black",
        evals: {
          5: { cp: 0, pv: ["Bc4", "g6", "Qf3", "Nf6"] },
          6: { cp: -900, pv: ["Nxe5", "d4", "Nc6", "Nf3"] },
        },
      });
      expect(g.analysis.finalLine?.[0]).toBe("c6e5");
      expect(hungPiece.detect(g)).toMatchObject([
        { ply: 5, evidence: "queen on e5 left en prise (-8), game ended before Nxe5", subject: "queen e5" },
      ]);
      expect(allowedTactic.detect(g)).toHaveLength(1);
      const mine = [hungPiece, allowedTactic, missedCapture, missedTactic];
      expect(findPatterns([g], mine).map((f) => [f.patternId, f.ply])).toEqual([["hung-piece", 5]]);
    });

    it("finds nothing without a final line, as before", async () => {
      const g = await fixtureGame({
        pgn: PGN,
        as: "white",
        evals: { 5: { cp: 0, pv: ["Bc4", "g6", "Qf3", "Nf6"] }, 6: { cp: -900 } },
      });
      expect(g.analysis.finalLine).toBeUndefined();
      expect(hungPiece.detect(g)).toEqual([]);
    });
  });
});
