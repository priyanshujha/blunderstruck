import { PUZZLE_VERSION, type PuzzleCandidate } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { formatPuzzles, lichessAnalysisUrl, lichessTrainingUrl } from "./puzzles-format";

const FEN_WHITE = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
const FEN_BLACK = "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4";

const base: PuzzleCandidate = {
  id: "g1~7~do-over",
  kind: "do-over",
  gameId: "g1",
  ply: 7,
  patternId: "missed-mate",
  fen: FEN_WHITE,
  solver: "white",
  accepted: ["h5f7"],
  line: ["h5f7"],
  played: { uci: "h5g5", san: "Qg5" },
  winPctLoss: 66,
  engine: { name: "Stockfish 19", depth: 18, lines: 5 },
  puzzleVersion: PUZZLE_VERSION,
};

const punish: PuzzleCandidate = {
  ...base,
  id: "g2~8~punish",
  kind: "punish",
  gameId: "g2",
  ply: 8,
  patternId: "hung-piece",
  fen: FEN_BLACK,
  solver: "black",
  accepted: ["e8f7", "g7f6"],
  played: { uci: "h5f7", san: "Qxf7#" },
};

describe("lichessAnalysisUrl", () => {
  it("writes every space of the FEN as an underscore", () => {
    expect(lichessAnalysisUrl(FEN_WHITE, "white")).toBe(
      "https://lichess.org/analysis/r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR_w_KQkq_-_4_4",
    );
  });

  it("faces the board from Black's side when Black is to move", () => {
    expect(lichessAnalysisUrl(FEN_BLACK, "black").endsWith("_0_4?color=black")).toBe(true);
  });
});

describe("formatPuzzles", () => {
  const text = formatPuzzles("alice", [base, punish], { max: 12, patterns: ["missed-mate"], patternsLabel: "your focus items" });

  it("describes a do-over with its position, accepted moves in SAN, the move played and a link", () => {
    expect(text).toContain("1. Do-over: missed-mate, game g1, ply 7");
    expect(text).toContain("White to move: find what you should have played here");
    expect(text).toContain(`FEN: ${FEN_WHITE}`);
    expect(text).toContain("Accepted: Qxf7#");
    expect(text).toContain("You played: Qg5");
    expect(text).toContain(`Analyse on Lichess: ${lichessAnalysisUrl(FEN_WHITE, "white")}`);
  });

  it("labels a punish and shows the solver's side", () => {
    expect(text).toContain("2. Punish it: hung-piece, game g2, ply 8");
    expect(text).toContain("Black to move: find the move that makes the opponent's mistake pay");
  });

  it("links the training themes of the given patterns", () => {
    expect(text).toContain("Practise your focus items on Lichess:");
    expect(text).toContain(`mateIn1: ${lichessTrainingUrl("mateIn1")}`);
    expect(text).toContain("https://lichess.org/training/mateIn2");
  });

  it("prints at most max candidates and says how many were left out", () => {
    const one = formatPuzzles("alice", [base, punish], { max: 1, patterns: [], patternsLabel: "" });
    expect(one).toContain("1 puzzle from alice's own games (1 more with --max)");
    expect(one).not.toContain("2. Punish it");
    expect(one).not.toContain("Practise");
  });

  it("skips patterns with no themes and ones it does not know, and lists a theme once per pattern", () => {
    const t = formatPuzzles("alice", [], { max: 12, patterns: ["time-trouble", "from-a-newer-version", "hung-piece", "hung-piece"], patternsLabel: "the patterns found" });
    expect(t).toContain("No puzzles from alice's games");
    expect(t).not.toContain("time-trouble");
    expect(t).not.toContain("newer-version");
    expect(t.match(/hangingPiece:/g)).toHaveLength(1);
  });
});
