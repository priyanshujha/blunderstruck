import { describe, expect, it } from "vitest";
import { formatEvalLines } from "./eval-format";

const FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

describe("formatEvalLines", () => {
  it("prints rank, UCI and SAN, score, win% and the start of the line", () => {
    const text = formatEvalLines("Stockfish 19", FEN, [
      { score: { mate: 1 }, depth: 18, bestMove: "h5f7", pv: ["h5f7"] },
      { score: { cp: -190 }, depth: 18, bestMove: "h5g5", pv: ["h5g5", "f6e4", "g5d8", "c6d8"] },
    ]);
    expect(text.split("\n")).toEqual([
      "Stockfish 19, depth 18; scores and win% are for white (to move)",
      "1  h5f7  Qxf7#  mate 1  100.0%  Qxf7#",
      "2  h5g5  Qg5      -190   33.2%  Qg5 Nxe4 Qxd8+ Nxd8",
    ]);
  });

  it("names Black when Black is to move, and copes with a finished game", () => {
    const text = formatEvalLines("Stockfish 19", "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1", [{ score: { mate: 0 }, depth: 0 }]);
    expect(text.split("\n")).toEqual(["Stockfish 19, depth 0; scores and win% are for black (to move)", "1  -  -  mate 0  0.0%"]);
  });
});
