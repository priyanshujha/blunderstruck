import type { AnalyzedGame, Score } from "@blunderstruck/contracts";
import { AnalyzedGame as AnalyzedGameSchema } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import type { EvalResult } from "./uci";
import { analyzeGame, checkGame, checkMoves, pliesFromPgn, resolveChecked, type Evaluator } from "./index";

type Script = Map<string, Partial<EvalResult> & { score: Score }>;

/** An evaluator that answers from a FEN-keyed script (side-to-move scores) and records each call. */
function scripted(script: Script, fallback: Score = { cp: 0 }) {
  const calls: { fen: string; depth: number }[] = [];
  let newGames = 0;
  const engine: Evaluator = {
    name: "stub",
    async newGame() {
      newGames++;
    },
    async evaluate(fen, depth) {
      calls.push({ fen, depth });
      const r = script.get(fen);
      return { depth, ...(r ?? { score: fallback }) };
    },
  };
  return { engine, calls, newGames: () => newGames };
}

/** Every position of a PGN in order: the start, then the position after each move. */
function positions(pgn: string): string[] {
  const plies = pliesFromPgn(pgn);
  return [plies[0]!.fenBefore, ...plies.map((p) => p.fenAfter)];
}

async function firstLook(pgn: string, script: Script): Promise<AnalyzedGame> {
  return analyzeGame(scripted(script).engine, { id: "g1", pgn }, { depth: 12 });
}

// Ten plies; White's 1st, 2nd and 3rd moves (plies 1, 3, 5) lose 300 cp each at the first look.
const OPEN = '[Event "t"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Be7 5. O-O O-O *';

async function openingGame(): Promise<AnalyzedGame> {
  const fens = positions(OPEN);
  const script: Script = new Map();
  // After plies 1, 3 and 5 Black (to move) is +300; everything else is level.
  for (const i of [1, 3, 5]) script.set(fens[i]!, { score: { cp: 300 } });
  // Black's next moves bring it back to level, so plies 2, 4 and 6 lose for Black.
  return firstLook(OPEN, script);
}

describe("checkMoves", () => {
  it("picks the side's moves that lost at least 5 win% at the first look, in ply order", async () => {
    const a = await openingGame();
    expect(checkMoves(a, "white", 18)).toEqual([1, 3, 5]);
    expect(checkMoves(a, "black", 18)).toEqual([2, 4, 6]);
    expect(checkMoves(a, "white", 0)).toEqual([]);
  });

  it("adds a move that gave up a mate in 2 even when it lost little", async () => {
    const a = await openingGame();
    const m = a.moves[6]!; // White's 4th move, ply 7: level before and after
    m.scoreBefore = { mate: 2 };
    m.scoreAfter = { cp: 900 };
    m.winPctLoss = 2.5;
    expect(checkMoves(a, "white", 18)).toEqual([1, 3, 5, 7]);
    m.scoreAfter = { mate: 1 }; // still mating
    expect(checkMoves(a, "white", 18)).toEqual([1, 3, 5]);
    m.scoreBefore = { mate: 3 }; // too far away
    m.scoreAfter = { cp: 900 };
    expect(checkMoves(a, "white", 18)).toEqual([1, 3, 5]);
  });

  it("leaves out a first look that lost under 5", async () => {
    const a = await openingGame();
    a.moves[0]!.winPctLoss = 4.9;
    expect(checkMoves(a, "white", 18)).toEqual([3, 5]);
  });
});

describe("checkGame", () => {
  it("calls newGame, then evaluates fenBefore and fenAfter of each flagged move in ply order", async () => {
    const a = await openingGame();
    const s = scripted(new Map());
    const c = await checkGame(s.engine, a, { depth: 18, color: "white" });
    expect(s.newGames()).toBe(1);
    const flagged = [0, 2, 4].map((i) => a.moves[i]!);
    expect(s.calls).toEqual(flagged.flatMap((m) => [{ fen: m.fenBefore, depth: 18 }, { fen: m.fenAfter, depth: 18 }]));
    expect(c.check).toEqual({ depth: 18, colors: ["white"] });
    expect(c.moves.filter((m) => m.check).map((m) => m.ply)).toEqual([1, 3, 5]);
    // The stub calls everything level: the checked loss is 0, the first look stays as it was.
    expect(c.moves[0]!.check).toMatchObject({ depth: 18, winPctLoss: 0, judgment: "ok" });
    expect(c.moves[0]!.judgment).toBe(a.moves[0]!.judgment);
    expect(() => AnalyzedGameSchema.parse(c)).not.toThrow();
  });

  it("never changes its input, and two runs give deep-equal output", async () => {
    const a = await openingGame();
    const before = structuredClone(a);
    const one = await checkGame(scripted(new Map()).engine, a, { depth: 18, color: "white" });
    const two = await checkGame(scripted(new Map()).engine, a, { depth: 18, color: "white" });
    expect(a).toEqual(before);
    expect(one).toEqual(two);
  });

  it("does not depend on what the engine searched before", async () => {
    // A stateful engine: each answer depends on how many positions it saw since newGame.
    let seen = 0;
    const engine: Evaluator = {
      name: "stub",
      async newGame() {
        seen = 0;
      },
      async evaluate(_fen, depth) {
        seen++;
        return { score: { cp: 10 * seen }, depth };
      },
    };
    const a = await openingGame();
    const alone = await checkGame(engine, a, { depth: 18, color: "white" });
    await checkGame(engine, a, { depth: 18, color: "black" });
    const after = await checkGame(engine, a, { depth: 18, color: "white" });
    expect(after).toEqual(alone);
  });

  it("still marks a game with no flagged moves as checked", async () => {
    const a = await firstLook(OPEN, new Map());
    const s = scripted(new Map());
    const c = await checkGame(s.engine, a, { depth: 18, color: "black" });
    expect(s.calls).toHaveLength(0);
    expect(c.check).toEqual({ depth: 18, colors: ["black"] });
    expect(c.moves.some((m) => m.check)).toBe(false);
  });

  it("merges colours at one depth, skips a colour already checked, and replaces a check at another depth", async () => {
    const a = await openingGame();
    const w = await checkGame(scripted(new Map()).engine, a, { depth: 18, color: "white" });
    const wb = await checkGame(scripted(new Map()).engine, w, { depth: 18, color: "black" });
    expect(wb.check).toEqual({ depth: 18, colors: ["white", "black"] });
    expect(wb.moves.filter((m) => m.check).map((m) => m.ply)).toEqual([1, 2, 3, 4, 5, 6]);

    const s = scripted(new Map());
    const again = await checkGame(s.engine, wb, { depth: 18, color: "white" });
    expect(s.calls).toHaveLength(0);
    expect(again).toEqual(wb);

    const deeper = await checkGame(scripted(new Map()).engine, wb, { depth: 22, color: "black" });
    expect(deeper.check).toEqual({ depth: 22, colors: ["black"] });
    expect(deeper.moves.filter((m) => m.check).map((m) => [m.ply, m.check!.depth])).toEqual([
      [2, 22],
      [4, 22],
      [6, 22],
    ]);
  });

  it("does not evaluate the position after a move that ended the game", async () => {
    const pgn = '[Event "t"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
    const a = await firstLook(pgn, new Map());
    a.moves[3]!.winPctLoss = 20; // pretend the first look flagged the mating move
    const s = scripted(new Map([[a.moves[3]!.fenBefore, { score: { mate: 1 }, bestMove: "d8h4", pv: ["d8h4"] }]]));
    const c = await checkGame(s.engine, a, { depth: 18, color: "black" });
    expect(s.calls.map((x) => x.fen)).toEqual([a.moves[3]!.fenBefore]);
    expect(c.moves[3]!.check).toEqual({
      depth: 18,
      scoreBefore: { mate: -1 },
      scoreAfter: { mate: -1 },
      bestUci: "d8h4",
      bestLine: ["d8h4"],
      winPctBefore: 100,
      winPctAfter: 100,
      winPctLoss: 0,
      judgment: "ok",
    });
  });

  it("rejects a depth that is not a positive integer", async () => {
    const a = await openingGame();
    await expect(checkGame(scripted(new Map()).engine, a, { depth: 0, color: "white" })).rejects.toThrow(RangeError);
  });
});

// Fixture F1, an allowed fork: White plays Qd2 and Black answers Ne4+, winning the queen.
const F1_FEN = "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1";
const F1 = `[Event "t"]\n[SetUp "1"]\n[FEN "${F1_FEN}"]\n\n1. Qd2 Ne4+ *`;
const F1_ANSWER = ["f6e4", "f2e1", "e4d2", "e1d2", "f8e8"];

async function f1Checked() {
  const [start, afterQd2] = positions(F1);
  // First look: the fork is half seen (White +7.48 before, still +5.40 after Qd2).
  const a = await firstLook(
    F1,
    new Map([
      [start!, { score: { cp: 748 }, bestMove: "h1e1", pv: ["h1e1", "f8d8"] }],
      [afterQd2!, { score: { cp: -540 }, bestMove: "g8h8", pv: ["g8h8", "a1e1"] }],
    ]),
  );
  // The check: White +7.88 before; after Qd2 Black is +2.83 with the fork.
  const deep = scripted(
    new Map([
      [start!, { score: { cp: 788 }, bestMove: "h1e1", pv: ["h1e1", "a8d8", "d1f3"] }],
      [afterQd2!, { score: { cp: 283 }, bestMove: "f6e4", pv: F1_ANSWER }],
    ]),
  );
  const c = await checkGame(deep.engine, a, { depth: 18, color: "white" });
  return { a, c, deep };
}

describe("F1 at the checked depth", () => {
  it("turns a small first-look loss into a blunder of about 68", async () => {
    const { a, c } = await f1Checked();
    expect(a.moves[0]!.judgment).toBe("inaccuracy");
    expect(a.moves[0]!.winPctLoss).toBeLessThan(10);
    const check = c.moves[0]!.check!;
    expect(check).toMatchObject({
      depth: 18,
      scoreBefore: { cp: 788 },
      scoreAfter: { cp: -283 },
      bestUci: "h1e1",
      bestLine: ["h1e1", "a8d8", "d1f3"],
      answerLine: F1_ANSWER,
      judgment: "blunder",
    });
    expect(check.winPctBefore).toBeCloseTo(94.6, 0);
    expect(check.winPctAfter).toBeCloseTo(26.1, 0);
    expect(check.winPctLoss).toBeCloseTo(68.5, 0);
  });

  it("resolves to the checked values; the reply keeps its numbers and takes the deeper answer line", async () => {
    const { a, c } = await f1Checked();
    const r = resolveChecked(c);
    const [qd2, ne4] = r.moves;
    const check = c.moves[0]!.check!;
    expect(qd2).toMatchObject({
      scoreBefore: check.scoreBefore,
      scoreAfter: check.scoreAfter,
      winPctBefore: check.winPctBefore,
      winPctAfter: check.winPctAfter,
      winPctLoss: check.winPctLoss,
      judgment: "blunder",
      bestUci: "h1e1",
      bestLine: ["h1e1", "a8d8", "d1f3"],
    });
    const stored = a.moves[1]!;
    expect(ne4).toEqual({ ...stored, bestUci: "f6e4", bestLine: F1_ANSWER });
    expect(() => AnalyzedGameSchema.parse(r)).not.toThrow();
  });
});

const NUMBERS = ["scoreBefore", "scoreAfter", "winPctBefore", "winPctAfter", "winPctLoss", "judgment"] as const;

/** Every move without its own check has the same numbers in the resolved game as in the stored one. */
function expectUncheckedKept(stored: AnalyzedGame, resolved: AnalyzedGame) {
  resolved.moves.forEach((m, i) => {
    if (m.check) return;
    for (const k of NUMBERS) expect(m[k], `ply ${m.ply} ${k}`).toEqual(stored.moves[i]![k]);
  });
}

describe("resolveChecked", () => {
  // A level first look in which one move lost 5.5; the check then finds the opponent +400 after it.
  for (const [flagged, color] of [
    [4, "white"],
    [5, "black"],
  ] as const) {
    it(`never re-judges an unchecked reply (${color} flagged)`, async () => {
      const a = await firstLook(OPEN, new Map());
      a.moves[flagged]!.winPctLoss = 5.5;
      const fens = positions(OPEN);
      const replyColor = color === "white" ? "black" : "white";
      const deep = new Map([[fens[flagged + 1]!, { score: { cp: 400 }, bestMove: "a2a3", pv: ["a2a3"] }]]);
      const one = await checkGame(scripted(deep).engine, a, { depth: 18, color });
      expect(checkMoves(one, replyColor, 18)).toEqual([]);
      const both = await checkGame(scripted(deep).engine, one, { depth: 18, color: replyColor });
      expect(both.check?.colors).toHaveLength(2);
      expect(both.moves[flagged]!.check?.judgment).toBe("blunder");
      for (const g of [one, both]) {
        const r = resolveChecked(g);
        const reply = r.moves[flagged + 1]!;
        expect(reply.check).toBeUndefined();
        expect(reply).toMatchObject({ winPctLoss: 0, judgment: "ok", bestUci: "a2a3", bestLine: ["a2a3"] });
        expect(r.moves[flagged]).toMatchObject({ judgment: "blunder" });
        expectUncheckedKept(a, r);
      }
    });
  }

  it("keeps every unchecked move's numbers, is idempotent and does not change its input", async () => {
    const a = await openingGame();
    const fens = positions(OPEN);
    const deep = scripted(new Map([[fens[3]!, { score: { cp: 500 }, bestMove: "f6e4", pv: ["f6e4"] }]]));
    const c = await checkGame(deep.engine, a, { depth: 18, color: "white" });
    const before = structuredClone(c);
    const r = resolveChecked(c);
    expect(c).toEqual(before);
    expect(resolveChecked(r)).toEqual(r);
    expectUncheckedKept(a, r);
    // Ply 4 answers the checked ply 3: only its line changes.
    expect(r.moves[3]).toEqual({ ...c.moves[3], bestUci: "f6e4", bestLine: ["f6e4"] });
    // A reply to a check without an answer line keeps its first-look line.
    expect(r.moves[1]).toEqual(c.moves[1]);
    // Moves next to no check are as stored.
    for (const i of [6, 7, 8, 9]) expect(r.moves[i]).toEqual(c.moves[i]);
  });

  it("gives each checked move its own checked values when both neighbours were checked", async () => {
    const a = await openingGame();
    const fens = positions(OPEN);
    const w = await checkGame(scripted(new Map([[fens[1]!, { score: { cp: 200 } }]])).engine, a, {
      depth: 18,
      color: "white",
    });
    const wb = await checkGame(scripted(new Map([[fens[1]!, { score: { cp: 260 } }]])).engine, w, {
      depth: 18,
      color: "black",
    });
    const r = resolveChecked(wb);
    expect(r.moves[0]!.scoreAfter).toEqual({ cp: -200 });
    expect(r.moves[0]!.judgment).toBe(wb.moves[0]!.check!.judgment);
    expect(r.moves[1]!.scoreBefore).toEqual({ cp: -260 });
    expect(r.moves[1]!.winPctLoss).toBe(wb.moves[1]!.check!.winPctLoss);
    expectUncheckedKept(a, r);
    expect(resolveChecked(r)).toEqual(r);
  });

  it("puts a last move's answer into finalLine", async () => {
    const pgn = '[Event "t"]\n\n1. e4 e5 *';
    const fens = positions(pgn);
    const a = await firstLook(pgn, new Map([[fens[2]!, { score: { cp: 400 }, bestMove: "d2d4", pv: ["d2d4", "d7d6"] }]]));
    expect(a.finalLine).toEqual(["d2d4", "d7d6"]);
    const deep = scripted(new Map([[fens[2]!, { score: { cp: 450 }, bestMove: "g1f3", pv: ["g1f3", "b8c6"] }]]));
    const c = await checkGame(deep.engine, a, { depth: 18, color: "black" });
    expect(c.moves[1]!.check?.answerLine).toEqual(["g1f3", "b8c6"]);
    expect(c.finalLine).toEqual(["d2d4", "d7d6"]);
    expect(resolveChecked(c).finalLine).toEqual(["g1f3", "b8c6"]);
  });

  it("leaves finalLine alone when a one-colour analysis's last move was not the game's last", async () => {
    const pgn = '[Event "t"]\n\n1. e4 e5 *';
    const fens = positions(pgn);
    const shallow = new Map([
      [fens[1]!, { score: { cp: 300 } }],
      [fens[2]!, { score: { cp: 0 }, bestMove: "d2d4", pv: ["d2d4", "d7d6"] }],
    ]);
    const a = await analyzeGame(scripted(shallow).engine, { id: "g1", pgn }, { depth: 12, only: "white" });
    expect(a.moves.map((m) => m.ply)).toEqual([1]);
    const deep = scripted(new Map([[fens[1]!, { score: { cp: 350 }, bestMove: "e7e5", pv: ["e7e5", "g1f3"] }]]));
    const c = await checkGame(deep.engine, a, { depth: 18, color: "white" });
    expect(c.moves[0]!.check?.answerLine).toEqual(["e7e5", "g1f3"]);
    expect(resolveChecked(c).finalLine).toEqual(["d2d4", "d7d6"]);
  });

  it("returns an unchecked game unchanged", async () => {
    const a = await openingGame();
    expect(resolveChecked(a)).toEqual(a);
  });
});
