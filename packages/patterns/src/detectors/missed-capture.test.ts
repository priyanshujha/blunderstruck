import { describe, expect, it } from "vitest";
import { findPatterns } from "../find";
import { fixtureGame } from "../test-fixtures";
import { allowedTactic } from "./allowed-tactic";
import { hungPiece } from "./hung-piece";
import { missedCapture } from "./missed-capture";
import { missedTactic } from "./missed-tactic";

const MINE = [hungPiece, allowedTactic, missedCapture, missedTactic];
const FOUR_KNIGHTS = "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6";
const fenPgn = (fen: string, moves: string): string => `[Event "fixture"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n${moves} *`;

describe("missed-capture", () => {
  it("flags Black's 4...d6 when ...bxa6 won the bishop, as missed-capture and not missed-tactic", async () => {
    const g = await fixtureGame({
      pgn: `${FOUR_KNIGHTS} 4. Ba6 d6 5. Bb5`,
      as: "black",
      evals: {
        8: { cp: -618, pv: ["bxa6", "d3", "d6", "O-O"] },
        9: { cp: 0, pv: ["Bb5", "Bd7", "O-O", "Be7"] },
      },
    });
    expect(missedCapture.detect(g)).toEqual([
      expect.objectContaining({ ply: 8, subject: "b7a6", evidence: "bxa6 would have won a bishop (+3); played 4...d6" }),
    ]);
    expect(missedCapture.detect(g)[0]!.motif).toBeUndefined();
    expect(missedTactic.detect(g)).toMatchObject([{ ply: 8 }]);
    expect(findPatterns([g], MINE).map((f) => [f.patternId, f.ply])).toEqual([["missed-capture", 8]]);
  });

  it("counts the same capture missed twice running once", async () => {
    const g = await fixtureGame({
      pgn: `${FOUR_KNIGHTS} 4. Ba6 d6 5. d3 Be7 6. Bb5`,
      as: "black",
      evals: {
        8: { cp: -618, pv: ["bxa6", "d3", "Be7", "O-O"] },
        9: { cp: 0, pv: ["Bb5", "Bd7", "O-O", "Be7"] },
        10: { cp: -618, pv: ["bxa6", "O-O", "Be7", "Bg5"] },
        11: { cp: 0, pv: ["Bb5", "O-O", "O-O", "Bd7"] },
      },
    });
    expect(missedCapture.detect(g).map((h) => [h.ply, h.subject])).toEqual([
      [8, "b7a6"],
      [10, "b7a6"],
    ]);
    expect(findPatterns([g], MINE).map((f) => [f.patternId, f.ply])).toEqual([["missed-capture", 8]]);
  });

  describe("when the best capture is only an even trade", () => {
    // White to move; 1.Rxd8 Qxd8 trades rooks (exchange count 0), then Nf7+ forks (depth 18: +6.46).
    const TRADE = "3r1q1k/6pp/8/4N3/8/8/5PPP/3RK3 w - - 0 1";

    it("finds nothing when the line wins nothing either", async () => {
      const g = await fixtureGame({
        pgn: fenPgn(TRADE, "1. Nf3 Rxd1+"),
        as: "white",
        evals: {
          1: { cp: 100, pv: ["Rxd8", "Qxd8", "Nf3", "h6"] },
          2: { cp: -600, pv: ["Rxd1+", "Kxd1", "h6", "Ke2"] },
        },
      });
      expect(g.analysis.moves[0]!.winPctLoss).toBeGreaterThanOrEqual(10);
      expect(findPatterns([g], MINE)).toEqual([]);
    });

    it("leaves a trade that leads into a fork to missed-tactic", async () => {
      const g = await fixtureGame({
        pgn: fenPgn(TRADE, "1. Nf3 Rxd1+"),
        as: "white",
        evals: {
          1: { cp: 646, pv: ["Rxd8", "Qxd8", "Nf7+", "Kg8", "Nxd8"] },
          2: { cp: -600, pv: ["Rxd1+", "Kxd1", "h6", "Ke2"] },
        },
      });
      expect(missedCapture.detect(g)).toEqual([]);
      expect(findPatterns([g], MINE).map((f) => [f.patternId, f.ply])).toEqual([["missed-tactic", 1]]);
    });
  });
});
