import { describe, expect, it } from "vitest";
import { type FixtureOptions, type ScriptedEval, fixtureGame } from "../test-fixtures";
import { thrownWin } from "./thrown-win";

// An invented Italian, 16 plies. The player is White. Scores are from White's side; ply n is
// the position before ply n. White reaches +7 before 3.Bc4 (ply 5) and 4.c3 (ply 7) drops it.
const PGN = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. Re1 a6 8. Bb3 Ba7";

function evals(drop: number, rest: number, extra: Record<number, ScriptedEval> = {}): Record<number, ScriptedEval> {
  const e: Record<number, ScriptedEval> = { 1: { cp: 0 }, 2: { cp: 0 }, 3: { cp: 0 }, 4: { cp: 0 } };
  e[5] = { cp: 700 };
  e[6] = { cp: 700 };
  e[7] = { cp: 700 };
  e[8] = { cp: drop };
  for (let p = 9; p <= 17; p++) e[p] = { cp: rest };
  return { ...e, ...extra };
}

const game = (o: Partial<FixtureOptions>) => fixtureGame({ pgn: PGN, as: "white", result: "black", ...o });

describe("thrown-win", () => {
  it("flags a +7 peak dropped to -2 in a lost game, on the drop", async () => {
    const g = await game({ evals: evals(-200, -200) });
    const hits = thrownWin.detect(g);
    expect(hits).toMatchObject([{ ply: 7, evidence: "won position (93%) at move 3, game lost; biggest drop 4.c3" }]);
    expect(hits[0]!.winPctLoss).toBeGreaterThan(55);
  });

  it("does not flag the same scores in a won game", async () => {
    const g = await game({ evals: evals(-200, -200), result: "white" });
    expect(thrownWin.detect(g)).toEqual([]);
  });

  it("flags a drawn game too", async () => {
    const g = await game({ evals: evals(-200, 0), result: "draw" });
    expect(thrownWin.detect(g)).toMatchObject([{ ply: 7, evidence: expect.stringContaining("game drawn") }]);
  });

  it("does not flag a game lost on time while still at +5 on the board", async () => {
    const g = await game({ evals: evals(-200, 500), termination: "outoftime" });
    expect(thrownWin.detect(g)).toEqual([]);
  });

  it("flags a game lost on time when the board was lost too", async () => {
    const g = await game({ evals: evals(-200, -200), termination: "timeout" });
    expect(thrownWin.detect(g)).toMatchObject([{ ply: 7 }]);
  });

  it("needs the peak: +3 dropped to -2 is not a thrown win", async () => {
    const e = evals(-200, -200, { 5: { cp: 300 }, 6: { cp: 300 }, 7: { cp: 300 } });
    expect(thrownWin.detect(await game({ evals: e }))).toEqual([]);
  });

  it("needs the floor: +7 to +4 is not a thrown win", async () => {
    expect(thrownWin.detect(await game({ evals: evals(400, 400) }))).toEqual([]);
  });

  it("is at most one per game, on the biggest drop after the peak, ignoring drops before it", async () => {
    // Before the peak: 2.Nf3 drops +3 to -3 (bigger than anything later). After it: 4.c3 drops
    // +7 to +1, then 6.O-O drops +1 to -2.5.
    const e = evals(100, 100, {
      3: { cp: 300 },
      4: { cp: -300 },
      11: { cp: 100 },
      12: { cp: -250 },
      13: { cp: -250 },
      14: { cp: -250 },
      15: { cp: -250 },
      16: { cp: -250 },
      17: { cp: -250 },
    });
    const hits = thrownWin.detect(await game({ evals: e }));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ ply: 7, evidence: expect.stringContaining("biggest drop 4.c3") });
  });

  it("works from Black's side", async () => {
    // Black is +7 before 3...Bc5 (ply 6) and 4...Nf6 (ply 8) drops to -2.
    const e: Record<number, ScriptedEval> = { 6: { cp: -700 }, 7: { cp: -700 }, 8: { cp: -700 } };
    for (let p = 9; p <= 17; p++) e[p] = { cp: 200 };
    const g = await fixtureGame({ pgn: PGN, as: "black", result: "white", evals: e });
    expect(thrownWin.detect(g)).toMatchObject([{ ply: 8, evidence: expect.stringContaining("biggest drop 4...Nf6") }]);
  });
});
