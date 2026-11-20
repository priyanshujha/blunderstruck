import { describe, expect, it } from "vitest";
import { fixtureGame } from "../test-fixtures";
import { missedMate } from "./missed-mate";

// 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? reaches
// r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4: White mates with Qxf7#.
// Ply 7 is White's 4th move. After 4.Qe2 Stockfish (depth 18) gives Black +3.28.
const OPENING = "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6";
const MATE_IN_1 = { mate: 1, bestMove: "Qxf7#" };

describe("missed-mate", () => {
  it("flags 4.Qe2 when 4.Qxf7# was mate in 1", async () => {
    const g = await fixtureGame({
      pgn: `${OPENING} 4. Qe2`,
      as: "white",
      result: "black",
      evals: { 7: MATE_IN_1, 8: { cp: -328 } },
    });
    expect(missedMate.detect(g)).toEqual([
      expect.objectContaining({ ply: 7, evidence: "mate in 1 with Qxf7#; played Qe2", subject: "h5f7" }),
    ]);
    expect(missedMate.detect(g)[0]!.winPctLoss).toBeGreaterThan(70);
  });

  it("does not flag 4.Qxf7#", async () => {
    const g = await fixtureGame({ pgn: `${OPENING} 4. Qxf7#`, as: "white", result: "white", evals: { 7: MATE_IN_1 } });
    expect(missedMate.detect(g)).toEqual([]);
  });

  it("ignores a mate in 3 before the move (beyond MATE_HORIZON)", async () => {
    const g = await fixtureGame({ pgn: `${OPENING} 4. Qe2`, as: "white", evals: { 7: { mate: 3 }, 8: { cp: -328 } } });
    expect(missedMate.detect(g)).toEqual([]);
  });

  it("flags a missed mate in 2", async () => {
    const g = await fixtureGame({ pgn: `${OPENING} 4. Qe2`, as: "white", evals: { 7: { mate: 2 }, 8: { cp: -328 } } });
    expect(missedMate.detect(g)).toMatchObject([{ ply: 7, evidence: "mate in 2; played Qe2" }]);
  });

  it("does not flag a slower mate kept", async () => {
    const g = await fixtureGame({ pgn: `${OPENING} 4. Qe2`, as: "white", evals: { 7: MATE_IN_1, 8: { mate: 3 } } });
    expect(missedMate.detect(g)).toEqual([]);
  });

  it("still flags when the player stays clearly winning (no winning-anyway rule)", async () => {
    const g = await fixtureGame({ pgn: `${OPENING} 4. Qe2`, as: "white", evals: { 7: MATE_IN_1, 8: { cp: 900 } } });
    expect(missedMate.detect(g)).toMatchObject([{ ply: 7 }]);
  });

  it("reads mate scores from Black's side", async () => {
    // Scripted: Black (to move at ply 6) mates in 1; scores are White's side, so mate -1.
    const g = await fixtureGame({
      pgn: `${OPENING} 4. Qe2`,
      as: "black",
      evals: { 6: { mate: -1, bestMove: "g6" }, 7: { cp: 0 } },
    });
    expect(missedMate.detect(g)).toMatchObject([{ ply: 6, evidence: "mate in 1 with g6; played Nf6" }]);
  });
});
