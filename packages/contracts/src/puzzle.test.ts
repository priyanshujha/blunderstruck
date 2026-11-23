import { describe, expect, it } from "vitest";
import {
  PATTERN_IDS,
  PATTERN_PUZZLE_THEMES,
  PUZZLE_THEMES,
  PUZZLE_VERSION,
  PuzzleCandidate,
  puzzleCandidateId,
  puzzleThemesFor,
} from "./index";

const candidate = {
  id: puzzleCandidateId("g1", 7, "punish"),
  kind: "punish",
  gameId: "g1",
  ply: 7,
  patternId: "missed-mate",
  fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
  solver: "white",
  accepted: ["h5f7"],
  line: ["h5f7"],
  played: { uci: "g8f6", san: "Nf6" },
  prevMove: { uci: "g8f6", san: "Nf6" },
  winPctLoss: 95,
  engine: { name: "stockfish", depth: 18, lines: 5 },
  puzzleVersion: PUZZLE_VERSION,
};

describe("PuzzleCandidate", () => {
  it("accepts a valid candidate", () => {
    expect(PuzzleCandidate.parse(candidate)).toEqual(candidate);
    expect(candidate.id).toBe("g1~7~punish");
  });

  it("rejects more than four accepted moves", () => {
    const accepted = ["a2a3", "b2b3", "c2c3", "d2d3", "e2e3"];
    expect(PuzzleCandidate.safeParse({ ...candidate, accepted }).success).toBe(false);
    expect(PuzzleCandidate.safeParse({ ...candidate, accepted: accepted.slice(0, 4) }).success).toBe(true);
  });

  it("rejects an empty accepted set", () => {
    expect(PuzzleCandidate.safeParse({ ...candidate, accepted: [] }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(PuzzleCandidate.safeParse({ ...candidate, kind: "mate" }).success).toBe(false);
  });
});

describe("PATTERN_PUZZLE_THEMES", () => {
  it("covers every pattern id and nothing else", () => {
    expect(Object.keys(PATTERN_PUZZLE_THEMES).sort()).toEqual([...PATTERN_IDS].sort());
  });

  it("uses only listed themes", () => {
    for (const themes of Object.values(PATTERN_PUZZLE_THEMES)) {
      for (const theme of themes) expect(PUZZLE_THEMES).toContain(theme);
    }
  });

  it("narrows allowed-tactic by motif", () => {
    expect(puzzleThemesFor("allowed-tactic", "fork")).toEqual(["defensiveMove", "fork"]);
    expect(puzzleThemesFor("allowed-tactic")).toEqual(PATTERN_PUZZLE_THEMES["allowed-tactic"]);
    expect(puzzleThemesFor("missed-tactic", "fork")).toEqual(PATTERN_PUZZLE_THEMES["missed-tactic"]);
    for (const motif of ["fork", "discovered-attack", "mate"] as const) {
      for (const t of puzzleThemesFor("allowed-tactic", motif)) expect(PUZZLE_THEMES).toContain(t);
    }
  });
});
