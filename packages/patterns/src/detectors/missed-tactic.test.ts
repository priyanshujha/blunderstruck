import { describe, expect, it } from "vitest";
import { findPatterns } from "../find";
import { fixtureGame } from "../test-fixtures";
import { allowedTactic } from "./allowed-tactic";
import { hungPiece } from "./hung-piece";
import { missedCapture } from "./missed-capture";
import { missedTactic } from "./missed-tactic";

const MINE = [hungPiece, allowedTactic, missedCapture, missedTactic];
const fenPgn = (fen: string, moves: string): string => `[Event "fixture"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n${moves} *`;

describe("missed-tactic", () => {
  // White to move: Nf7+ forks king and queen (depth 18: +5.11).
  const MISSED_FORK = "3q3k/6pp/8/4N3/8/8/6PP/6K1 w - - 0 1";

  it("flags 1.h3 instead of the Nf7+ fork, with motif fork", async () => {
    const g = await fixtureGame({
      pgn: fenPgn(MISSED_FORK, "1. h3 Qd4+"),
      as: "white",
      evals: {
        1: { cp: 511, pv: ["Nf7+", "Kg8", "Nxd8"] },
        // Depth 18 after 1.h3: ...Qd4+ Kf1 Qxe5, Black +9.05.
        2: { cp: -905, pv: ["Qd4+", "Kf1", "Qxe5"] },
      },
    });
    expect(missedTactic.detect(g)).toEqual([
      expect.objectContaining({
        ply: 1,
        motif: "fork",
        subject: "e5f7",
        evidence: "missed Nf7+ Kg8 Nxd8 (fork), which wins 9; played 1.h3",
      }),
    ]);
    // 1.h3 also lets ...Qd4+ fork king and knight, and what a move gives away ranks first.
    expect(findPatterns([g], MINE).map((f) => [f.patternId, f.motif])).toEqual([["allowed-tactic", "fork"]]);
  });

  it("is the label when the played move gives nothing away", async () => {
    const g = await fixtureGame({
      pgn: fenPgn(MISSED_FORK, "1. Nf3 Kg8"),
      as: "white",
      evals: {
        1: { cp: 511, pv: ["Nf7+", "Kg8", "Nxd8"] },
        2: { cp: -600, pv: ["Kg8", "Kf2", "Kf7", "Ke3"] },
      },
    });
    expect(findPatterns([g], MINE).map((f) => [f.patternId, f.ply, f.motif])).toEqual([["missed-tactic", 1, "fork"]]);
  });

  it("gives no finding for 5.Qc4 when Qb5+ is answered by ...Bd7", async () => {
    const g = await fixtureGame({
      pgn: fenPgn("rn1qkb1r/ppp1pppp/5n2/5bN1/4p3/8/PPPPQPPP/RNB1KB1R w KQkq - 4 5", "5. Qc4 e6"),
      as: "white",
      evals: {
        9: { cp: 150, pv: ["Qb5+", "Bd7", "Qc4", "e6"] },
        // Depth 18 after 5.Qc4.
        10: { cp: -216, pv: ["e6", "Nc3", "Nc6", "Ngxe4", "Nxe4", "Nxe4", "Nd4", "Qa4", "c6", "c3"] },
      },
    });
    expect(g.analysis.moves[0]!.winPctLoss).toBeGreaterThanOrEqual(10);
    expect(findPatterns([g], MINE)).toEqual([]);
  });

  it("flags a missed mate in 3 (beyond missed-mate's horizon) with motif mate", async () => {
    // Depth 18: mate in 3 by Nh6+ Kh8 Qg8+ Rxg8 Nf7#; the 4th ply is quiet, the mate comes on the 5th.
    const g = await fixtureGame({
      pgn: fenPgn("r4rk1/5Npp/1q6/8/2Q5/8/5PPP/6K1 w - - 0 1", "1. Ng5 Kh8"),
      as: "white",
      result: "black",
      evals: {
        1: { mate: 3, pv: ["Nh6+", "Kh8", "Qg8+", "Rxg8", "Nf7#"] },
        // Depth 18 after 1.Ng5: Black +11.20.
        2: { cp: -1120, pv: ["Kh8", "h4", "Ra1+", "Kh2", "Qd6"] },
      },
    });
    expect(missedTactic.detect(g)).toEqual([
      expect.objectContaining({
        ply: 1,
        motif: "mate",
        subject: "f7h6",
        evidence: "missed Nh6+ Kh8 Qg8+ Rxg8 Nf7#, which mates; played 1.Ng5",
      }),
    ]);
    expect(findPatterns([g], MINE).map((f) => f.patternId)).toEqual(["missed-tactic"]);
  });

  it("keeps counting past ply 4 through a check and a capture", async () => {
    // Qc2+ Kg8 Qb3+ Kh8 Qxb8+: ply 4 is followed by a capture, so the rook counts. Evals invented.
    const g = await fixtureGame({
      pgn: fenPgn("1r6/6pk/8/8/8/8/6PP/2Q3K1 w - - 0 1", "1. h3 Rb2"),
      as: "white",
      evals: {
        1: { cp: 200, pv: ["Qc2+", "Kg8", "Qb3+", "Kh8", "Qxb8+"] },
        2: { cp: -150, pv: ["Rb2", "Qc7", "Rb1+", "Kh2"] },
      },
    });
    expect(missedTactic.detect(g)).toEqual([
      expect.objectContaining({ ply: 1, subject: "c1c2", evidence: "missed Qc2+ Kg8 Qb3+ Kh8 Qxb8+, which wins 5; played 1.h3" }),
    ]);
  });

  it("finds nothing when the engine's line wins less than 2", async () => {
    const g = await fixtureGame({
      pgn: fenPgn(MISSED_FORK, "1. Nf3 Kg8"),
      as: "white",
      evals: {
        1: { cp: 511, pv: ["Ng4", "Kg8", "Kf2", "Kf7"] },
        2: { cp: -600, pv: ["Kg8", "Kf2", "Kf7", "Ke3"] },
      },
    });
    expect(missedTactic.detect(g)).toEqual([]);
  });

  it("counts the same best move missed twice running once", async () => {
    const g = await fixtureGame({
      pgn: fenPgn(MISSED_FORK, "1. Kf1 g6 2. Ke1 Kg7"),
      as: "white",
      evals: {
        1: { cp: 511, pv: ["Nf7+", "Kg8", "Nxd8"] },
        2: { cp: -600, pv: ["g6", "Kf2", "Kg7", "Ke3"] },
        3: { cp: 511, pv: ["Nf7+", "Kg7", "Nxd8"] },
        4: { cp: -600, pv: ["Kg7", "Ke2", "Kf6", "Ke3"] },
      },
    });
    expect(missedTactic.detect(g).map((h) => [h.ply, h.subject])).toEqual([
      [1, "e5f7"],
      [3, "e5f7"],
    ]);
    expect(findPatterns([g], [missedTactic]).map((f) => f.ply)).toEqual([1]);
  });
});
