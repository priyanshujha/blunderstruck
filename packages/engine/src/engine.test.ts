import { describe, expect, it } from "vitest";
import { analyzeGame, judge, moverWinPct, pliesFromPgn, toWhitePov, winPct } from "./index";
import { parseInfoLine } from "./uci";

describe("winPct / judge", () => {
  it("is 50 at equality, symmetric, and saturates on mate", () => {
    expect(winPct({ cp: 0 })).toBe(50);
    expect(winPct({ cp: 300 }) + winPct({ cp: -300 })).toBeCloseTo(100);
    expect(winPct({ cp: 300 })).toBeGreaterThan(70);
    expect(winPct({ mate: 2 })).toBe(100);
    expect(moverWinPct({ mate: 2 }, "black")).toBe(0);
  });

  it("flips side-to-move scores to White's view", () => {
    expect(toWhitePov({ cp: 120 }, "black")).toEqual({ cp: -120 });
    expect(toWhitePov({ mate: -3 }, "black")).toEqual({ mate: 3 });
    expect(toWhitePov({ cp: 120 }, "white")).toEqual({ cp: 120 });
  });

  it("turns UCI's unsigned 'mate 0' into a loss for the side to move", () => {
    expect(toWhitePov({ mate: 0 }, "white")).toEqual({ mate: -1 });
    expect(toWhitePov({ mate: 0 }, "black")).toEqual({ mate: 1 });
    expect(moverWinPct(toWhitePov({ mate: 0 }, "black"), "black")).toBe(0);
  });

  it("uses the 5 / 10 / 15 thresholds", () => {
    expect([4.9, 5, 10, 15].map(judge)).toEqual(["ok", "inaccuracy", "mistake", "blunder"]);
  });
});

const FOOLS_MATE = '[Event "t"]\n\n1. f3 { [%clk 0:02:58] } e5 { [%clk 0:02:59] } 2. g4 Qh4# 0-1';

describe("pliesFromPgn", () => {
  it("replays moves, reads clocks and flags checkmate", () => {
    const plies = pliesFromPgn(FOOLS_MATE);
    expect(plies.map((p) => p.san)).toEqual(["f3", "e5", "g4", "Qh4#"]);
    expect(plies[0]).toMatchObject({ ply: 1, color: "white", uci: "f2f3", clockSeconds: 178 });
    expect(plies[0]!.fenBefore).toMatch(/^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w KQkq/);
    expect(plies[3]).toMatchObject({ color: "black", uci: "d8h4", terminal: "checkmate" });
  });

  it("writes castling the way engines do, for both sides and both wings", () => {
    const pgn =
      '[Event "t"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O d6 5. d3 Bg4 6. Nc3 Qd7 7. a3 O-O-O *';
    const plies = pliesFromPgn(pgn);
    expect(plies.find((p) => p.san === "O-O")).toMatchObject({ color: "white", uci: "e1g1" });
    expect(plies.find((p) => p.san === "O-O-O")).toMatchObject({ color: "black", uci: "e8c8" });
  });

  it("keeps a custom starting position's move numbering", () => {
    const pgn =
      '[Event "t"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 10"]\n\n10... Kd7 11. e4 *';
    expect(pliesFromPgn(pgn).map((p) => [p.ply, p.color, p.san])).toEqual([
      [20, "black", "Kd7"],
      [21, "white", "e4"],
    ]);
  });
});

describe("analyzeGame", () => {
  it("scores each move by win probability lost and never asks the engine about a mated position", async () => {
    const asked: string[] = [];
    // Side-to-move scores: start equal; after 1.f3 Black is +100; after 1...e5 White is -100;
    // after 2.g4 Black has mate in 1.
    const script = [{ cp: 0 }, { cp: 100 }, { cp: -100 }, { mate: 1 }];
    let newGames = 0;
    const engine = {
      name: "stub",
      async newGame() {
        newGames++;
      },
      async evaluate(fen: string) {
        asked.push(fen);
        return { score: script[asked.length - 1]!, depth: 1, bestMove: asked.length === 4 ? "d8h4" : "a2a3" };
      },
    };
    const a = await analyzeGame(engine, { id: "g1", pgn: FOOLS_MATE }, { depth: 1 });
    expect(asked).toHaveLength(4);
    expect(newGames).toBe(1);
    expect(a.moves.map((m) => m.judgment)).toEqual(["inaccuracy", "ok", "blunder", "ok"]);
    expect(a.moves[2]).toMatchObject({ san: "g4", scoreAfter: { mate: -1 }, winPctAfter: 0 });
    expect(a.moves[3]).toMatchObject({ san: "Qh4#", bestUci: "d8h4", winPctLoss: 0, winPctAfter: 100 });

    const whiteOnly = await analyzeGame(
      { ...engine, evaluate: async () => ({ score: { cp: 0 }, depth: 1 }) },
      { id: "g1", pgn: FOOLS_MATE },
      { only: "white" },
    );
    expect(whiteOnly.moves.map((m) => m.san)).toEqual(["f3", "g4"]);
  });
});

describe("parseInfoLine", () => {
  it("reads depth, score and pv from an exact line", () => {
    const line =
      "info depth 12 seldepth 18 multipv 1 score cp -35 nodes 120034 nps 900000 hashfull 40 tbhits 0 time 133 pv e7e5 g1f3 b8c6 f1b5";
    expect(parseInfoLine(line)).toEqual({ depth: 12, score: { cp: -35 }, pv: ["e7e5", "g1f3", "b8c6", "f1b5"] });
    expect(parseInfoLine("info depth 0 score mate 0")).toEqual({ depth: 0, score: { mate: 0 } });
  });

  it("skips bound lines and lines without a score", () => {
    expect(parseInfoLine("info depth 9 seldepth 12 score cp 40 upperbound nodes 900 pv d2d4")).toBeUndefined();
    expect(parseInfoLine("info depth 9 seldepth 12 score cp 40 lowerbound nodes 900 pv d2d4")).toBeUndefined();
    expect(parseInfoLine("info depth 9 currmove e2e4 currmovenumber 1")).toBeUndefined();
    expect(parseInfoLine("info string NNUE evaluation enabled")).toBeUndefined();
    expect(parseInfoLine("bestmove e2e4 ponder e7e5")).toBeUndefined();
  });
});

describe("analyzeGame bestLine", () => {
  const PGN = '[Event "t"]\n\n1. e4 e5 *';
  const long = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7", "f1e1", "b7b5"];

  it("stores the main line from fenBefore, cut to 10 plies", async () => {
    const engine = {
      name: "stub",
      async evaluate() {
        return { score: { cp: 20 }, depth: 1, bestMove: "e2e4", pv: long };
      },
    };
    const a = await analyzeGame(engine, { id: "g1", pgn: PGN }, { depth: 1 });
    expect(a.moves[0]!.bestLine).toEqual(long.slice(0, 10));
    expect(a.moves[0]!.bestLine![0]).toBe(a.moves[0]!.bestUci);
  });

  it("leaves bestLine out when the pv disagrees with bestmove or is missing", async () => {
    let n = 0;
    const engine = {
      name: "stub",
      async evaluate() {
        n++;
        // Position 1: pv starts elsewhere. Position 2: no pv at all.
        return n === 1
          ? { score: { cp: 20 }, depth: 1, bestMove: "e2e4", pv: ["d2d4", "d7d5"] }
          : { score: { cp: 20 }, depth: 1, bestMove: "e7e5" };
      },
    };
    const a = await analyzeGame(engine, { id: "g1", pgn: PGN }, { depth: 1 });
    expect(a.moves[0]!.bestUci).toBe("e2e4");
    expect(a.moves[0]).not.toHaveProperty("bestLine");
    expect(a.moves[1]).not.toHaveProperty("bestLine");
  });
});

describe("analyzeGame finalLine", () => {
  const PGN = '[Event "t"]\n\n1. e4 e5 *';
  const long = ["g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7", "f1e1", "b7b5", "a4b3"];
  // Positions asked, in order: start, after 1.e4, after 1...e5 (the final position).
  const stub = (final: { bestMove?: string; pv?: string[] }) => {
    let n = 0;
    return {
      name: "stub",
      async evaluate() {
        n++;
        return n === 3 ? { score: { cp: 20 }, depth: 1, ...final } : { score: { cp: 20 }, depth: 1 };
      },
    };
  };

  it("stores the line from the position after the last move, cut to 10 plies", async () => {
    const a = await analyzeGame(stub({ bestMove: "g1f3", pv: long }), { id: "g1", pgn: PGN }, { depth: 1 });
    expect(a.finalLine).toEqual(long.slice(0, 10));
  });

  it("leaves finalLine out on pv/bestmove disagreement or no best move", async () => {
    const a = await analyzeGame(stub({ bestMove: "g1f3", pv: ["d2d4"] }), { id: "g1", pgn: PGN }, { depth: 1 });
    expect(a).not.toHaveProperty("finalLine");
    const b = await analyzeGame(stub({ pv: long }), { id: "g1", pgn: PGN }, { depth: 1 });
    expect(b).not.toHaveProperty("finalLine");
  });

  it("leaves finalLine out when the game ends in mate", async () => {
    const engine = {
      name: "stub",
      async evaluate() {
        return { score: { cp: 0 }, depth: 1, bestMove: "a2a3", pv: ["a2a3", "a7a6"] };
      },
    };
    const a = await analyzeGame(engine, { id: "g1", pgn: FOOLS_MATE }, { depth: 1 });
    expect(a.moves.at(-1)!.san).toBe("Qh4#");
    expect(a).not.toHaveProperty("finalLine");
  });
});
