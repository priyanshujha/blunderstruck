import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineExitedError, MultiPvCollector, UciEngine } from "./uci";

/** Captured from Stockfish 19: MultiPV 3, depth 3, on a position where Qxf7 mates. */
const MATE_IN_ONE = [
  "info string NNUE evaluation using nn-1111cefa1111.nnue enabled",
  "info depth 1 seldepth 3 multipv 1 score mate 1 nodes 142 nps 142000 hashfull 0 tbhits 0 time 1 pv h5f7",
  "info depth 1 seldepth 3 multipv 2 score cp -52 nodes 142 nps 142000 hashfull 0 tbhits 0 time 1 pv c4f7 e8e7",
  "info depth 1 seldepth 3 multipv 3 score cp -65 nodes 142 nps 142000 hashfull 0 tbhits 0 time 1 pv h5e2 a7a6",
  "info depth 2 seldepth 2 multipv 1 score mate 1 nodes 330 nps 330000 hashfull 0 tbhits 0 time 1 pv h5f7",
  "info depth 2 seldepth 3 multipv 2 score cp -52 nodes 330 nps 330000 hashfull 0 tbhits 0 time 1 pv c4f7 e8e7",
  "info depth 2 seldepth 4 multipv 3 score cp -90 nodes 330 nps 330000 hashfull 0 tbhits 0 time 1 pv h5e2 a7a6 a2a3",
  "info depth 3 seldepth 2 multipv 1 score mate 1 nodes 538 nps 538000 hashfull 0 tbhits 0 time 1 pv h5f7",
  "info depth 3 seldepth 6 multipv 2 score cp -190 nodes 538 nps 538000 hashfull 0 tbhits 0 time 1 pv h5g5 f6e4 g5d8 c6d8",
  "info depth 3 seldepth 4 multipv 3 score cp -190 upperbound nodes 500 nps 500000 hashfull 0 tbhits 0 time 1 pv h5e2",
  "info depth 3 seldepth 4 multipv 3 score cp -193 nodes 538 nps 538000 hashfull 0 tbhits 0 time 1 pv h5e2 c6d4 e2d3",
  "info depth 3 currmove h5f7 currmovenumber 1",
  "bestmove h5f7",
];

/** Captured from Stockfish 19: MultiPV 5, depth 2, Black in check with four legal moves. */
const FOUR_MOVES = [
  "info depth 1 seldepth 2 multipv 1 score cp -488 nodes 10 nps 10000 hashfull 0 tbhits 0 time 1 pv e8f7",
  "info depth 1 seldepth 2 multipv 2 score cp -503 nodes 10 nps 10000 hashfull 0 tbhits 0 time 1 pv e8d7",
  "info depth 1 seldepth 2 multipv 3 score cp -507 nodes 10 nps 10000 hashfull 0 tbhits 0 time 1 pv e8f8",
  "info depth 1 seldepth 2 multipv 4 score cp -512 nodes 10 nps 10000 hashfull 0 tbhits 0 time 1 pv e8d8",
  "info depth 2 seldepth 4 multipv 1 score cp -490 nodes 136 nps 136000 hashfull 0 tbhits 0 time 1 pv e8f8 e2f2 f8e7",
  "info depth 2 seldepth 4 multipv 2 score cp -490 nodes 136 nps 136000 hashfull 0 tbhits 0 time 1 pv e8d8 e2f2 d8e7",
  "info depth 2 seldepth 6 multipv 3 score cp -493 nodes 136 nps 136000 hashfull 0 tbhits 0 time 1 pv e8d7 e2f2",
  "info depth 2 seldepth 4 multipv 4 score cp -494 nodes 136 nps 136000 hashfull 0 tbhits 0 time 1 pv e8f7 e2f2 f7e6",
  "bestmove e8f8 ponder e2f2",
];

function collect(lines: number, output: string[]) {
  const c = new MultiPvCollector(lines);
  const done = output.map((l) => c.push(l));
  return { done, results: c.results() };
}

describe("MultiPvCollector", () => {
  it("keeps the deepest exact line per rank, best first, with mate scores", () => {
    const { done, results } = collect(3, MATE_IN_ONE);
    expect(done.indexOf(true)).toBe(MATE_IN_ONE.length - 1);
    expect(results).toEqual([
      { score: { mate: 1 }, depth: 3, bestMove: "h5f7", pv: ["h5f7"] },
      { score: { cp: -190 }, depth: 3, bestMove: "h5g5", pv: ["h5g5", "f6e4", "g5d8", "c6d8"] },
      { score: { cp: -193 }, depth: 3, bestMove: "h5e2", pv: ["h5e2", "c6d4", "e2d3"] },
    ]);
  });

  it("returns fewer lines when there are fewer legal moves", () => {
    const { results } = collect(5, FOUR_MOVES);
    expect(results.map((r) => [r.bestMove, r.depth])).toEqual([
      ["e8f8", 2],
      ["e8d8", 2],
      ["e8d7", 2],
      ["e8f7", 2],
    ]);
  });

  it("ignores ranks above the requested count", () => {
    expect(collect(2, MATE_IN_ONE).results.map((r) => r.bestMove)).toEqual(["h5f7", "h5g5"]);
  });

  it("reports a finished game as one line without a move", () => {
    expect(collect(3, ["info depth 0 score mate 0", "bestmove (none)"]).results).toEqual([
      { score: { mate: 0 }, depth: 0 },
    ]);
    expect(collect(3, ["info depth 0 score cp 0", "bestmove (none)"]).results).toEqual([{ score: { cp: 0 }, depth: 0 }]);
  });
});

/**
 * A stand-in engine: logs every command it receives and answers "go" with captured output.
 * With `dieOnGo` it exits instead, as a crashed engine would.
 */
function fakeEngine(dir: string, log: string, reply: string[], dieOnGo = false): string {
  const path = join(dir, "fake-engine");
  const script = `#!${process.execPath}
const fs = require("node:fs");
const reply = ${JSON.stringify(reply)};
require("node:readline").createInterface({ input: process.stdin }).on("line", (cmd) => {
  fs.appendFileSync(${JSON.stringify(log)}, cmd + "\\n");
  if (cmd === "uci") process.stdout.write("id name Fake\\nuciok\\n");
  else if (cmd === "isready") process.stdout.write("readyok\\n");
  else if (cmd.startsWith("go ")) {
    if (${dieOnGo}) process.exit(1);
    process.stdout.write(reply.join("\\n") + "\\n");
  } else if (cmd === "quit") process.exit(0);
});
`;
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return path;
}

describe.skipIf(process.platform === "win32")("UciEngine.evaluateMulti", () => {
  let dir: string;
  let log: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "blunderstruck-engine-"));
    log = join(dir, "commands.log");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const commands = () => readFileSync(log, "utf8").trim().split("\n");

  it("sets MultiPV, clears the hash, searches, then sets MultiPV back to 1", async () => {
    const engine = await UciEngine.start({ path: fakeEngine(dir, log, MATE_IN_ONE) });
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    const results = await engine.evaluateMulti(fen, 3, 3);
    await engine.quit();
    expect(results.map((r) => r.bestMove)).toEqual(["h5f7", "h5g5", "h5e2"]);
    expect(commands().slice(4)).toEqual([
      "setoption name MultiPV value 3",
      "ucinewgame",
      "isready",
      `position fen ${fen}`,
      "go depth 3",
      "setoption name MultiPV value 1",
      "quit",
    ]);
  });

  it("sets MultiPV back to 1 when the search fails", async () => {
    const engine = await UciEngine.start({ path: fakeEngine(dir, log, MATE_IN_ONE) });
    vi.spyOn(engine, "newGame").mockRejectedValueOnce(new Error("boom"));
    await expect(engine.evaluateMulti("8/8/8/8/8/8/8/K6k w - - 0 1", 3, 2)).rejects.toThrow("boom");
    await engine.quit();
    expect(commands().slice(4)).toEqual(["setoption name MultiPV value 2", "setoption name MultiPV value 1", "quit"]);
  });

  it("rejects with EngineExitedError when the engine dies mid-search", async () => {
    const engine = await UciEngine.start({ path: fakeEngine(dir, log, [], true) });
    await expect(engine.evaluateMulti("8/8/8/8/8/8/8/K6k w - - 0 1", 3, 2)).rejects.toBeInstanceOf(EngineExitedError);
  });

  it("rejects a line count below one", async () => {
    const engine = await UciEngine.start({ path: fakeEngine(dir, log, MATE_IN_ONE) });
    await expect(engine.evaluateMulti("8/8/8/8/8/8/8/K6k w - - 0 1", 3, 0)).rejects.toBeInstanceOf(RangeError);
    await engine.quit();
  });
});
