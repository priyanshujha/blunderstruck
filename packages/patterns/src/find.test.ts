import { ANALYSIS_VERSION, type AnalyzedMove, PATTERN_IDS, type PatternId } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { DETECTORS } from "./detectors";
import { findPatterns } from "./find";
import type { DetectorFamily, DetectorHit, GameDetector, PlayerGame, SetDetector } from "./types";

/**
 * A stand-in game. With `losses`, it has moves for plies 1-40 (only `ply`, `color` and
 * `winPctLoss` matter here), each losing 0 win% unless listed; without, it has no moves.
 */
const game = (gameId: string, losses?: Record<number, number>, best: Record<number, string> = {}): PlayerGame => ({
  analysis: {
    gameId,
    analysisVersion: ANALYSIS_VERSION,
    engine: { name: "stub", depth: 1 },
    moves: losses
      ? Array.from(
          { length: 40 },
          (_, i) =>
            ({
              ply: i + 1,
              color: i % 2 === 0 ? "white" : "black",
              winPctLoss: losses[i + 1] ?? 0,
              bestUci: best[i + 1],
            }) as AnalyzedMove,
        )
      : [],
  },
  color: "white",
  outcome: "loss",
});

const hit = (gameId: string, ply: number, extra: Partial<DetectorHit> = {}): DetectorHit => ({
  gameId,
  ply,
  winPctLoss: 20,
  evidence: `ply ${ply}`,
  ...extra,
});

/** A game detector that reports the given hits for whichever game it is shown. */
function fake(id: PatternId, family: DetectorFamily, hits: (gameId: string) => DetectorHit[]): GameDetector {
  return { id, scope: "game", family, detect: (g) => hits(g.analysis.gameId) };
}

describe("DETECTORS", () => {
  it("lists every pattern once, in PATTERN_IDS order, with its scope and family", () => {
    expect(DETECTORS.map((d) => d.id)).toEqual([...PATTERN_IDS]);
    expect(DETECTORS.filter((d) => d.scope === "set").map((d) => d.id)).toEqual(["opening-trouble"]);
    expect(DETECTORS.filter((d) => d.family === "context").map((d) => d.id)).toEqual([
      "thrown-win",
      "time-trouble",
      "opening-trouble",
    ]);
  });
});

describe("findPatterns", () => {
  it("keeps one tactical label per move, the earliest in PATTERN_IDS, whatever order detectors run in", () => {
    const detectors = [
      fake("missed-tactic", "tactical", (g) => [hit(g, 7), hit(g, 9)]),
      fake("hung-piece", "tactical", (g) => [hit(g, 7, { evidence: "hung" })]),
      fake("allowed-tactic", "tactical", (g) => [hit(g, 7, { motif: "fork" })]),
    ];
    const out = findPatterns([game("g1")], detectors);
    expect(out.map((f) => [f.patternId, f.ply])).toEqual([
      ["hung-piece", 7],
      ["missed-tactic", 9],
    ]);
    expect(out[0]).toEqual({ patternId: "hung-piece", gameId: "g1", ply: 7, winPctLoss: 20, evidence: "hung" });
  });

  it("lets context findings share a move with a tactical one", () => {
    const detectors = [
      fake("time-trouble", "context", (g) => [hit(g, 7)]),
      fake("thrown-win", "context", (g) => [hit(g, 7)]),
      fake("missed-mate", "tactical", (g) => [hit(g, 7)]),
    ];
    expect(findPatterns([game("g1")], detectors).map((f) => f.patternId)).toEqual([
      "missed-mate",
      "thrown-win",
      "time-trouble",
    ]);
  });

  it("counts a streak about the same subject once, and a new subject or a mistake in between again", () => {
    const detectors = [
      fake("hung-piece", "tactical", (g) => [
        hit(g, 7, { subject: "knight@e4" }),
        hit(g, 9, { subject: "knight@e4" }),
        hit(g, 11, { subject: "knight@e4" }),
        hit(g, 13, { subject: "bishop@b5" }),
        hit(g, 17, { subject: "bishop@b5" }),
        hit(g, 21),
        hit(g, 23),
      ]),
    ];
    // Ply 15 is a mistake of its own, so the bishop on 17 is a new occurrence.
    const g = game("g1", { 7: 20, 9: 20, 11: 20, 13: 20, 15: 12, 17: 20, 21: 20, 23: 20 });
    expect(findPatterns([g], detectors).map((f) => f.ply)).toEqual([7, 13, 17, 21, 23]);
    expect(findPatterns([g], detectors)[0]!.subject).toBe("knight@e4");
    // Without the moves in between, a gap ends the streak too.
    expect(findPatterns([game("g1")], detectors).map((f) => f.ply)).toEqual([7, 13, 17, 21, 23]);
  });

  it("keeps a streak through clean moves of the player's in between", () => {
    const capture = [
      fake("missed-capture", "tactical", (g) => [
        hit(g, 15, { subject: "e2f1" }),
        hit(g, 17, { subject: "e2f1" }),
        hit(g, 23, { subject: "e2f1" }),
      ]),
    ];
    // Plies 19 and 21 lose less than a mistake (the opponent's plies don't matter): one streak.
    const clean = game("g1", { 15: 20, 17: 15, 18: 40, 19: 0, 21: 3, 23: 25 });
    expect(findPatterns([clean], capture).map((f) => f.ply)).toEqual([15]);
    // A countable mistake with a different best move at ply 19 ends it: 23 is a new occurrence.
    const broken = game("g1", { 15: 20, 17: 15, 19: 18, 23: 25 }, { 19: "d1d2" });
    expect(findPatterns([broken], capture).map((f) => f.ply)).toEqual([15, 23]);
  });

  it("keeps a streak through an unlabelled mistake that missed the same best move", () => {
    // Ply 19 is a forced recapture (no loss); ply 21 misses Kxf1 again and loses 18.7, but wins
    // some material back, so the detector's gate fails there and only 15, 17 and 23 are hit.
    const capture = [
      fake("missed-capture", "tactical", (g) => [
        hit(g, 15, { subject: "e2f1" }),
        hit(g, 17, { subject: "e2f1" }),
        hit(g, 23, { subject: "e2f1" }),
      ]),
    ];
    const losses = { 15: 40.8, 17: 17.6, 19: 0, 21: 18.7, 23: 36.8 };
    const best = { 15: "e2f1", 17: "e2f1", 21: "e2f1", 23: "e2f1" };
    expect(findPatterns([game("g1", losses, best)], capture).map((f) => f.ply)).toEqual([15]);
    // A piece-and-square subject never equals a best move: the mistake at 21 still ends that streak.
    const hung = [fake("hung-piece", "tactical", (g) => [hit(g, 15, { subject: "queen e5" }), hit(g, 23, { subject: "queen e5" })])];
    expect(findPatterns([game("g1", losses, best)], hung).map((f) => f.ply)).toEqual([15, 23]);
  });

  it("does not let a matching best move bridge an allowed-tactic streak", () => {
    // allowed-tactic's subject is the opponent's key move; the player's best move at ply 21 happens
    // to be the same UCI string, but the mistake there still ends the streak.
    const allowed = [
      fake("allowed-tactic", "tactical", (g) => [hit(g, 15, { subject: "d4f5" }), hit(g, 23, { subject: "d4f5" })]),
    ];
    const losses = { 15: 30, 21: 18.7, 23: 30 };
    const best = { 21: "d4f5" };
    expect(findPatterns([game("g1", losses, best)], allowed).map((f) => f.ply)).toEqual([15, 23]);
    // The same moves with missed-tactic, whose subject is the player's best move, are one streak.
    const missed = [fake("missed-tactic", "tactical", (g) => [hit(g, 15, { subject: "d4f5" }), hit(g, 23, { subject: "d4f5" })])];
    expect(findPatterns([game("g1", losses, best)], missed).map((f) => f.ply)).toEqual([15]);
  });

  it("a streak continuation still claims its move from lower-ranked labels", () => {
    const detectors = [
      fake("hung-piece", "tactical", (g) => [hit(g, 7, { subject: "rook@a1" }), hit(g, 9, { subject: "rook@a1" })]),
      fake("allowed-tactic", "tactical", (g) => [hit(g, 9, { subject: "a1" })]),
    ];
    expect(findPatterns([game("g1")], detectors).map((f) => [f.patternId, f.ply])).toEqual([["hung-piece", 7]]);
  });

  it("a hit that lost the move to a higher label does not start a streak", () => {
    const detectors = [
      fake("missed-mate", "tactical", (g) => [hit(g, 7)]),
      fake("hung-piece", "tactical", (g) => [hit(g, 7, { subject: "queen@d1" }), hit(g, 9, { subject: "queen@d1" })]),
    ];
    expect(findPatterns([game("g1")], detectors).map((f) => [f.patternId, f.ply])).toEqual([
      ["missed-mate", 7],
      ["hung-piece", 9],
    ]);
  });

  it("runs set detectors once over all games and orders findings by game, then ply", () => {
    const calls: number[] = [];
    const opening: SetDetector = {
      id: "opening-trouble",
      scope: "set",
      family: "context",
      detect(gs) {
        calls.push(gs.length);
        return [hit("g2", 4, { subject: "k" }), hit("g1", 4, { subject: "k" }), hit("unknown", 4)];
      },
    };
    const detectors = [opening, fake("missed-mate", "tactical", (g) => [hit(g, 9)])];
    const out = findPatterns([game("g1"), game("g2")], detectors);
    expect(calls).toEqual([1 * 2]);
    expect(out.map((f) => `${f.gameId}:${f.ply}:${f.patternId}`)).toEqual([
      "g1:4:opening-trouble",
      "g1:9:missed-mate",
      "g2:4:opening-trouble",
      "g2:9:missed-mate",
    ]);
  });

  it("finds nothing with the placeholder detectors or no games", () => {
    expect(findPatterns([game("g1")])).toEqual([]);
    expect(findPatterns([])).toEqual([]);
  });
});
