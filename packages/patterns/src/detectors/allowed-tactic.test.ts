import { describe, expect, it } from "vitest";
import { findPatterns } from "../find";
import { fixtureGame } from "../test-fixtures";
import { allowedTactic } from "./allowed-tactic";
import { hungPiece } from "./hung-piece";
import { missedCapture } from "./missed-capture";
import { missedTactic } from "./missed-tactic";

/** The four detectors of this package, in `PATTERN_IDS` order. */
const MINE = [hungPiece, allowedTactic, missedCapture, missedTactic];

const fenPgn = (fen: string, moves: string): string => `[Event "fixture"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n${moves} *`;

describe("allowed-tactic", () => {
  // Black is +8.90 (depth 18, best ...Qd4+); ...Kh8?? walks into Nf7+ and Nxd8.
  const ALLOWED_FORK = "3q2k1/6pp/8/4N3/8/8/6PP/6K1 b - - 0 1";

  it("flags ...Kh8?? allowing the Nf7+ fork, as allowed-tactic and not hung-piece", async () => {
    const g = await fixtureGame({
      pgn: fenPgn(ALLOWED_FORK, "1... Kh8 2. Nf7+"),
      as: "black",
      result: "white",
      evals: {
        2: { cp: -890, pv: ["Qd4+", "Kf1", "Qxe5", "h3"] },
        3: { cp: 511, pv: ["Nf7+", "Kg8", "Nxd8"] },
      },
    });
    expect(allowedTactic.detect(g)).toEqual([
      expect.objectContaining({
        ply: 2,
        motif: "fork",
        subject: "e5f7",
        evidence: "allowed Nf7+ Kg8 Nxd8 (fork), which wins 9",
      }),
    ]);
    expect(hungPiece.detect(g)).toEqual([]);
    // ...Qd4+ also won a knight, so missed-tactic holds too; allowed-tactic outranks it.
    expect(missedTactic.detect(g)).toHaveLength(1);
    expect(findPatterns([g], MINE).map((f) => [f.patternId, f.ply, f.motif])).toEqual([["allowed-tactic", 2, "fork"]]);
  });

  it("4.Ba6?? bxa6 is hung-piece, not allowed-tactic", async () => {
    const g = await fixtureGame({
      pgn: "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Ba6 bxa6",
      as: "white",
      result: "black",
      evals: {
        7: { cp: 20, pv: ["Bb5", "Bc5", "O-O", "O-O"] },
        8: { cp: -618, pv: ["bxa6", "d3", "d6", "O-O"] },
      },
    });
    expect(allowedTactic.detect(g)).toMatchObject([{ ply: 7, evidence: "allowed bxa6 d3 d6, which wins 3" }]);
    expect(findPatterns([g], MINE).map((f) => [f.patternId, f.ply])).toEqual([["hung-piece", 7]]);
  });

  it("finds nothing when the played line loses less than 2", async () => {
    const g = await fixtureGame({
      pgn: "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Ba6 d6",
      as: "white",
      evals: {
        7: { cp: 20, pv: ["Bb5", "Bc5", "O-O", "O-O"] },
        8: { cp: -150, pv: ["d6", "Bb5", "Bd7", "O-O"] },
      },
    });
    expect(allowedTactic.detect(g)).toEqual([]);
  });

  describe("on the game's last move", () => {
    const ALLOWED_FORK = "3q2k1/6pp/8/4N3/8/8/6PP/6K1 b - - 0 1";
    const before = { cp: -890, pv: ["Qd4+", "Kf1", "Qxe5", "h3"] };

    it("reads the fork from the engine's final line", async () => {
      const g = await fixtureGame({
        pgn: fenPgn(ALLOWED_FORK, "1... Kh8"),
        as: "black",
        result: "white",
        evals: { 2: before, 3: { cp: 511, pv: ["Nf7+", "Kg8", "Nxd8"] } },
      });
      expect(allowedTactic.detect(g)).toEqual([
        expect.objectContaining({
          ply: 2,
          motif: "fork",
          subject: "e5f7",
          evidence: "allowed Nf7+ Kg8 Nxd8 (fork), which wins 9",
        }),
      ]);
      expect(findPatterns([g], MINE).map((f) => [f.patternId, f.motif])).toEqual([["allowed-tactic", "fork"]]);
    });

    it("without a final line sees no loss and does not crash", async () => {
      const g = await fixtureGame({
        pgn: fenPgn(ALLOWED_FORK, "1... Kh8"),
        as: "black",
        evals: { 2: before, 3: { cp: 511 } },
      });
      expect(g.analysis.finalLine).toBeUndefined();
      expect(allowedTactic.detect(g)).toEqual([]);
      expect(findPatterns([g], MINE).map((f) => f.patternId)).toEqual(["missed-tactic"]);
    });
  });
});
