import { ExampleStory } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { moveDetail, storyOf } from "./story";
import { fixtureGame, type ScriptedEval } from "./test-fixtures";
import type { PlayerGame } from "./types";

/*
 * Every position, score and line below was checked with Stockfish 19 at depth 18 (scores from
 * White's side, lines cut to the ten plies the analysis stores). The detectors are not run:
 * the stories are read straight from the scripted analysis.
 */

const fenPgn = (fen: string, moves: string): string => `[Event "fixture"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n${moves} *`;

/** The story of the move at `ply`, checked against the contract. */
function story(g: PlayerGame, ply: number, patternId?: string): ExampleStory {
  const s = storyOf(g, { gameId: g.analysis.gameId, ply, ...(patternId ? { patternId } : {}) });
  expect(s).toBeDefined();
  return ExampleStory.parse(s);
}

const brief = (s: ExampleStory, line: "punish" | "better" = "punish"): string[] => s[line].map((m) => m.san);

// F1/F3: the same fork, allowed by White (Qd2?) or missed by Black (...h6?).
const F1 = "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1";
const F1_EVALS: Record<string, ScriptedEval> = {
  // +7.78, best Re1.
  1: { cp: 778, pv: ["h1e1", "c7c5", "d1f3", "b7b6", "f2g1", "h7h6", "f3b7", "a8b8", "b7a6", "f6d5"] },
  // After Qd2 Black is +2.83 with the fork.
  2: { cp: -283, pv: ["f6e4", "f2e1", "e4d2", "e1d2", "f8e8", "a1d1", "a8d8", "d2c3", "f7f5", "h1e1"] },
  // After Qd2 h6 White is +7.63.
  "r4rk1/ppp2pp1/5n1p/8/8/8/PPPQ1KPP/R6R w - - 0 2": { cp: 763, pv: ["h1e1", "a8d8", "d2b4", "f6d5", "b4b7", "a7a5", "f2g1", "d5b4", "b7e4", "d8d2"] },
};

describe("storyOf: F1, an allowed fork", () => {
  it("reads Qd2? Ne4+ Ke1 Nxd2 Kxd2, the targets, the queen lost and why Re1 was better", async () => {
    const g = await fixtureGame({ pgn: fenPgn(F1, "1. Qd2 Ne4+"), as: "white", evals: F1_EVALS });
    const s = story(g, 1);
    expect(s.played).toMatchObject({ san: "Qd2", uci: "d1d2", from: "d1", to: "d2", piece: "queen", color: "white" });
    expect(s.played.fenAfter).toBe(g.analysis.moves[0]!.fenAfter);
    expect(brief(s)).toEqual(["Ne4+", "Ke1", "Nxd2", "Kxd2"]);
    expect(s.punish[0]).toMatchObject({ piece: "knight", check: true, mate: false });
    expect(s.punish[2]).toMatchObject({ piece: "knight", captured: "queen" });
    expect(s.punish[3]).toMatchObject({ piece: "king", captured: "knight" });
    expect(s.key).toEqual({ line: "punish", index: 0 });
    expect(s.targets).toEqual([
      { square: "f2", piece: "king", color: "white" },
      { square: "d2", piece: "queen", color: "white" },
    ]);
    expect(s.rear).toBeUndefined();
    expect(s.lost).toEqual({ square: "d2", piece: "queen", color: "white" });
    expect(s.gain).toBe(-6);
    expect(s.replyFound).toBe(true);
    expect(s.actualReply).toMatchObject({ san: "Ne4+", uci: "f6e4" });
    // Re1 leaves Ne4+ legal, but the rook then takes the knight on e4.
    expect(brief(s, "better")).toEqual(["Re1"]);
    expect(s.betterGain).toBe(0);
    expect(s.betterReason).toEqual({ kind: "covers-square", square: "e4", piece: "knight", gain: 3 });
    expect(s.winPctBefore).toBe(g.analysis.moves[0]!.winPctBefore);
    expect(s.winPctAfter).toBe(g.analysis.moves[0]!.winPctAfter);
    expect(s.depth).toBe(1);
  });

  it("records that the opponent did not play the punishing move", async () => {
    const g = await fixtureGame({ pgn: fenPgn(F1, "1. Qd2 h6"), as: "white", evals: F1_EVALS });
    const s = story(g, 1);
    expect(brief(s)).toEqual(["Ne4+", "Ke1", "Nxd2", "Kxd2"]);
    expect(s.replyFound).toBe(false);
    expect(s.actualReply).toMatchObject({ san: "h6", uci: "h7h6", piece: "pawn", color: "black" });
  });

  it("reads the game's final line when the finding is on the last move", async () => {
    const g = await fixtureGame({ pgn: fenPgn(F1, "1. Qd2"), as: "white", evals: F1_EVALS });
    expect(g.analysis.finalLine?.[0]).toBe("f6e4");
    const s = story(g, 1);
    expect(brief(s)).toEqual(["Ne4+", "Ke1", "Nxd2", "Kxd2"]);
    expect(s.replyFound).toBe(false);
    expect(s.actualReply).toBeUndefined();
    expect(s.lost).toMatchObject({ piece: "queen" });
  });

  it("stops cleanly at an illegal move in a stored line", async () => {
    const g = await fixtureGame({ pgn: fenPgn(F1, "1. Qd2 Ne4+"), as: "white", evals: F1_EVALS });
    // Corrupt both stored lines: the fourth answer move and the second best move are illegal.
    g.analysis.moves[1]!.bestLine = ["f6e4", "f2e1", "e4d2", "e1e8", "f8e8"];
    g.analysis.moves[0]!.bestLine = ["h1e1", "h1h8"];
    const s = story(g, 1);
    expect(brief(s)).toEqual(["Ne4+", "Ke1", "Nxd2"]);
    expect(s.gain).toBe(-9);
    expect(brief(s, "better")).toEqual(["Re1"]);
  });

  it("is undefined for a ply outside the game or a finding from another game", async () => {
    const g = await fixtureGame({ pgn: fenPgn(F1, "1. Qd2 Ne4+"), as: "white", evals: F1_EVALS });
    expect(storyOf(g, { gameId: g.analysis.gameId, ply: 9 })).toBeUndefined();
    expect(storyOf(g, { gameId: "elsewhere", ply: 1 })).toBeUndefined();
  });
});

describe("storyOf: F3, a missed fork", () => {
  const F3 = "r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1";

  it("reads the better line ...Ne4+ Ke1 Nxd2 Kxd2 as winning the queen for a knight", async () => {
    const g = await fixtureGame({
      pgn: fenPgn(F3, "1... h6"),
      as: "black",
      evals: { 2: F1_EVALS[2]!, "r4rk1/ppp2pp1/5n1p/8/8/8/PPPQ1KPP/R6R w - - 0 2": F1_EVALS["r4rk1/ppp2pp1/5n1p/8/8/8/PPPQ1KPP/R6R w - - 0 2"]! },
    });
    const s = story(g, 2, "missed-tactic");
    expect(s.played).toMatchObject({ san: "h6", piece: "pawn", color: "black" });
    expect(brief(s, "better")).toEqual(["Ne4+", "Ke1", "Nxd2", "Kxd2"]);
    expect(s.betterGain).toBe(6);
    expect(s.betterReason).toEqual({ kind: "wins", square: "d2", piece: "queen", gave: "knight", gain: 6 });
    // A missed-pattern story keys on the player's own shot.
    expect(s.key).toEqual({ line: "better", index: 0 });
    expect(s.targets).toEqual([
      { square: "f2", piece: "king", color: "white" },
      { square: "d2", piece: "queen", color: "white" },
    ]);
    // White's answer Re1 Rad8 Qb4 has no capture or check in the stretch read.
    expect(s.punish).toEqual([]);
    expect(s.gain).toBe(0);
    expect(s.lost).toBeUndefined();
  });
});

describe("storyOf: F2, a piece hung after a capture", () => {
  const PGN = "1. e4 e5 2. Nf3 Nc6 3. Nxe5 Nxe5";
  const BEFORE: ScriptedEval = { cp: 43, pv: ["f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "b7b5", "a4b3", "f8c5", "a2a4", "c8b7"] };

  it("reads 3.Nxe5? Nxe5: the knight lost and Bb5 holding", async () => {
    const g = await fixtureGame({
      pgn: PGN,
      as: "white",
      evals: { 5: BEFORE, 6: { cp: -401, pv: ["c6e5", "b1c3", "e5g6", "d2d4", "f8b4", "d1e2", "b4c3", "b2c3", "h7h5", "c3c4"] } },
    });
    const s = story(g, 5);
    expect(s.played).toMatchObject({ san: "Nxe5", captured: "pawn" });
    expect(brief(s)).toEqual(["Nxe5"]);
    expect(s.lost).toEqual({ square: "e5", piece: "knight", color: "white" });
    expect(s.gain).toBe(-2);
    expect(s.targets).toEqual([]);
    expect(brief(s, "better")).toEqual(["Bb5"]);
    // ...Nxe5 is not possible after Bb5 (e5 holds Black's own pawn), so the reason is "holds".
    expect(s.betterReason).toEqual({ kind: "holds", gain: 0 });
  });

  it("handles a punishing line that is a single capture", async () => {
    const g = await fixtureGame({ pgn: PGN, as: "white", evals: { 5: BEFORE, 6: { cp: -401, pv: ["c6e5"] } } });
    const s = story(g, 5);
    expect(brief(s)).toEqual(["Nxe5"]);
    expect(s.gain).toBe(-2);
    expect(s.replyFound).toBe(true);
  });
});

describe("storyOf: mates", () => {
  const BACK_RANK = "4r1k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1";
  // -0.05, best g4 (luft).
  const BEFORE: ScriptedEval = { cp: -5, pv: ["g2g4", "h7h6", "d1d6", "g8f8", "g1f1", "e8e4", "h2h3", "e4e6", "d6e6", "f7e6"] };

  it("reads an allowed back-rank mate, Rd7? Re1#", async () => {
    const g = await fixtureGame({
      pgn: fenPgn(BACK_RANK, "1. Rd7 Re1#"),
      as: "white",
      result: "black",
      evals: { 1: BEFORE, 2: { mate: -1, pv: ["e8e1"] } },
    });
    const s = story(g, 1);
    expect(s.punish).toHaveLength(1);
    expect(s.punish[0]).toMatchObject({ san: "Re1#", check: true, mate: true, piece: "rook" });
    expect(s.replyFound).toBe(true);
    expect(s.targets).toEqual([{ square: "g1", piece: "king", color: "white" }]);
    expect(s.gain).toBe(0);
    expect(s.lost).toBeUndefined();
    // After g4, ...Re1+ is met by Rxe1.
    expect(s.betterReason).toEqual({ kind: "covers-square", square: "e1", piece: "rook", gain: 5 });
  });

  it("reads a missed mate in one as `mates`", async () => {
    const g = await fixtureGame({
      pgn: fenPgn(BACK_RANK, "1. Rd7 h6"),
      as: "black",
      evals: {
        1: BEFORE,
        2: { mate: -1, pv: ["e8e1"] },
        3: { cp: -6, pv: ["h2h4", "e8e6", "g1h2", "e6f6", "f2f3", "g7g6", "d7a7", "f6f4", "a7a8", "g8h7"] },
      },
    });
    const s = story(g, 2, "missed-mate");
    expect(brief(s, "better")).toEqual(["Re1#"]);
    expect(s.betterReason).toEqual({ kind: "mates", mateIn: 1 });
    expect(s.key).toEqual({ line: "better", index: 0 });
  });
});

describe("storyOf: key moves", () => {
  it("keys on the fork Ne5+ in Bxf7+ Kxf7 Ne5+, not on the first punishing move", async () => {
    // Black has mate in 3 (...Qxa1); ...Qc6? lets White fork king and queen (+0.12).
    const g = await fixtureGame({
      pgn: fenPgn("5bkr/5ppp/q7/8/8/1B3N2/5PPP/R5K1 b - - 0 1", "1... Qc6 2. Bxf7+"),
      as: "black",
      evals: {
        2: { mate: -3, pv: ["a6a1", "b3d1", "a1d1", "f3e1", "d1e1"] },
        3: { cp: 12, pv: ["b3f7", "g8f7", "f3e5", "f7e6", "e5c6", "f8c5", "a1e1", "e6f6", "e1e5", "h8a8"] },
      },
    });
    const s = story(g, 2, "allowed-tactic");
    expect(brief(s)).toEqual(["Bxf7+", "Kxf7", "Ne5+", "Ke6", "Nxc6"]);
    expect(s.key).toEqual({ line: "punish", index: 2 });
    expect(s.targets).toEqual([
      { square: "f7", piece: "king", color: "black" },
      { square: "c6", piece: "queen", color: "black" },
    ]);
    expect(s.lost).toEqual({ square: "c6", piece: "queen", color: "black" });
    expect(s.gain).toBe(-7);
    expect(s.betterReason).toEqual({ kind: "mates", mateIn: 3 });
    // As a missed-mate story the key is the player's own first move of the mate.
    expect(story(g, 2, "missed-mate").key).toEqual({ line: "better", index: 0 });
  });

  it("names the rear piece of a discovered check, Rb2? Bxb2+", async () => {
    const g = await fixtureGame({
      pgn: fenPgn("4r1k1/8/8/4b3/8/8/7P/1R2K3 w - - 0 1", "1. Rb2 Bxb2+"),
      as: "white",
      evals: {
        1: { cp: 0, pv: ["h2h3", "e5d6", "e1f2", "e8e5", "b1g1", "g8f7", "g1g4", "e5f5", "f2g2"] },
        2: { cp: -629, pv: ["e5b2", "e1d2", "e8b8", "d2d3", "b8b4", "d3c2", "b2a1", "c2d2", "g8f7", "d2d3"] },
      },
    });
    const s = story(g, 1);
    expect(brief(s)).toEqual(["Bxb2+"]);
    expect(s.punish[0]).toMatchObject({ captured: "rook", check: true });
    expect(s.rear).toEqual({ square: "e8", piece: "rook", color: "black" });
    expect(s.targets).toEqual([{ square: "e1", piece: "king", color: "white" }]);
    expect(s.lost).toEqual({ square: "b2", piece: "rook", color: "white" });
    expect(s.gain).toBe(-5);
    // After h3, ...Bb2+ is still a discovered check, and the rook may not take: no square reason.
    expect(s.betterReason).toEqual({ kind: "holds", gain: 0 });
  });
});

describe("moveDetail flags", () => {
  const CASTLING = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";

  it("castling both ways, in standard UCI", () => {
    expect(moveDetail(CASTLING, "e1g1")).toMatchObject({ san: "O-O", uci: "e1g1", from: "e1", to: "g1", piece: "king", castle: "king" });
    expect(moveDetail(CASTLING, "e1c1")).toMatchObject({ san: "O-O-O", uci: "e1c1", to: "c1", castle: "queen" });
    const black = moveDetail("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1", "e8c8")!;
    expect(black).toMatchObject({ san: "O-O-O", color: "black", castle: "queen" });
    expect(black.captured).toBeUndefined();
    expect(moveDetail(CASTLING, "e1f1")!.castle).toBeUndefined();
  });

  it("promotion, with check and as an underpromotion", () => {
    expect(moveDetail("8/P7/8/8/8/8/8/k6K w - - 0 1", "a7a8q")).toMatchObject({
      san: "a8=Q+",
      uci: "a7a8q",
      piece: "pawn",
      promotion: "queen",
      check: true,
      mate: false,
    });
    expect(moveDetail("8/P7/8/8/8/8/8/k6K w - - 0 1", "a7a8n")).toMatchObject({ promotion: "knight", check: false });
  });

  it("en passant", () => {
    const d = moveDetail("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", "e5d6")!;
    expect(d).toMatchObject({ san: "exd6", piece: "pawn", captured: "pawn", enPassant: true });
    expect(d.fenAfter.split(" ")[0]).toBe("4k3/8/3P4/8/8/8/8/4K3");
    expect(moveDetail("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", "e5e6")!.enPassant).toBeUndefined();
  });

  it("is undefined for an illegal move", () => {
    expect(moveDetail("4k3/8/8/8/8/8/8/4K3 w - - 0 1", "e1e3")).toBeUndefined();
  });
});

describe("storyOf: no square reason the better move did not earn", () => {
  const QH4 = "1. e4 e5 2. Nf3 Qh4";
  const AFTER_NF3: ScriptedEval = { cp: 30, pv: ["b8c6", "f1b5", "g8f6", "e1g1", "f6e4", "f1e1", "e4d6", "f3e5", "f8e7", "b5f1"] };
  const AFTER_QH4: ScriptedEval = { cp: 920, pv: ["f3h4", "d7d5", "h4f5", "d5e4", "f5g7", "f8g7", "d2d3", "g7f8", "d3e4", "g8f6"] };

  it("2...Qh4?? 3.Nxh4: the point of ...Nc6 is not putting the queen there", async () => {
    const g = await fixtureGame({ pgn: `${QH4} 3. Nxh4`, as: "black", evals: { 4: AFTER_NF3, 5: AFTER_QH4 } });
    const s = story(g, 4);
    expect(brief(s)).toEqual(["Nxh4", "d5", "Nf5", "dxe4", "Nxg7+", "Bxg7"]);
    expect(s.key).toEqual({ line: "punish", index: 0 });
    expect(s.lost).toEqual({ square: "h4", piece: "queen", color: "black" });
    expect(s.betterReason?.kind).not.toBe("covers-square");
    expect(s.betterReason).toEqual({ kind: "holds", gain: 1 });
  });

  it("3.d3? after 2...Qh4: the missed shot Nxh4 is the key, and the reason names h4", async () => {
    const g = await fixtureGame({
      pgn: `${QH4} 3. d3`,
      as: "white",
      evals: {
        5: AFTER_QH4,
        6: { cp: -109, pv: ["h4e7", "d3d4", "d7d6", "b1c3", "c7c6", "f1c4", "g8f6", "c1e3", "h7h6", "e1g1"] },
      },
    });
    const s = story(g, 5, "missed-capture");
    expect(s.key).toEqual({ line: "better", index: 0 });
    expect(s.better[0]).toMatchObject({ san: "Nxh4", captured: "queen" });
    expect(s.betterReason).toMatchObject({ kind: "wins", square: "h4", piece: "queen" });
  });

  it("Legal's trap, 4...g6? 5.Nxe5: Black recaptures on e5 too, so no covers-square", async () => {
    const g = await fixtureGame({
      pgn: "1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5",
      as: "black",
      evals: {
        8: { cp: 60, pv: ["g8f6", "h2h3", "g4f3", "d1f3", "b8c6", "c3e2", "c6a5", "c4b5", "c7c6", "b5d3"] },
        9: { cp: 254, pv: ["f3e5", "d6e5", "d1g4", "b8c6", "d2d3", "g8f6", "g4f3", "c6d4", "f3d1", "d8d7"] },
      },
    });
    const s = story(g, 8);
    expect(brief(s)).toEqual(["Nxe5", "dxe5", "Qxg4"]);
    expect(s.gain).toBe(-1);
    expect(s.lost).toBeUndefined();
    expect(s.betterReason).toEqual({ kind: "holds", gain: 0 });
  });

  it("d4? exd3+ en passant: what stops it is not playing d4, not Qc6", async () => {
    const g = await fixtureGame({
      pgn: fenPgn("4r1k1/5ppp/8/8/4p3/8/2QP1PPP/4K3 w - - 0 1", "1. d4 exd3+"),
      as: "white",
      evals: {
        1: { cp: 752, pv: ["c2c6", "g8f8", "c6d6", "f8g8", "d6d7", "g8f8", "e1e2", "e8e6", "d7d8", "e6e8"] },
        2: { cp: -697, pv: ["e4d3", "e1d2", "d3c2", "d2c2", "g8f8", "c2d2", "f8e7", "g2g4", "e8a8", "g4g5"] },
      },
    });
    const s = story(g, 1);
    expect(brief(s)).toEqual(["exd3+", "Kd2", "dxc2", "Kxc2"]);
    expect(s.punish[0]).toMatchObject({ enPassant: true, captured: "pawn", check: true });
    expect(s.rear).toEqual({ square: "e8", piece: "rook", color: "black" });
    expect(s.lost).toEqual({ square: "c2", piece: "queen", color: "white" });
    expect(s.betterReason?.kind).not.toBe("stops-key-move");
    expect(s.betterReason).toEqual({ kind: "holds", gain: 0 });
  });

  it("Nd5? Nxd5 exd5 Qxd5 trades knights and loses a pawn: no piece lost", async () => {
    const g = await fixtureGame({
      pgn: fenPgn("r2q1rk1/ppp2ppp/5n2/8/4P3/2N5/PPP1QPPP/R4RK1 w - - 0 1", "1. Nd5 Nxd5"),
      as: "white",
      evals: {
        1: { cp: 259, pv: ["a1d1", "d8e7", "e4e5", "f6d7", "f2f4", "d7b6", "c3e4", "a8d8", "d1e1", "h7h6"] },
        2: { cp: -2, pv: ["f6d5", "e4d5", "d8d5", "f1e1", "d5c6", "e2e4", "c6e4", "e1e4", "f8e8", "e4e8"] },
      },
    });
    const s = story(g, 1);
    expect(brief(s)).toEqual(["Nxd5", "exd5", "Qxd5"]);
    expect(s.gain).toBe(-1);
    expect(s.lost).toBeUndefined();
  });
});
