import { describe, expect, it } from "vitest";
import { fixtureGame } from "../test-fixtures";
import { timeTrouble } from "./time-trouble";

// An invented game. The player is White; 3.Bc4 (ply 5) is scripted as a mistake (0 to -1.5).
// White's clock before 3.Bc4 is the clock after 2.Nf3, `left` seconds.
function pgn(left: number | undefined): string {
  if (left === undefined) return "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5";
  const c = (s: number) => `{ [%clk 0:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}] }`;
  return `1. e4 ${c(178)} e5 ${c(179)} 2. Nf3 ${c(left)} Nc6 ${c(170)} 3. Bc4 ${c(Math.max(0, left - 2))} Bc5 ${c(165)}`;
}

const MISTAKE = { 5: { cp: 0 }, 6: { cp: -150 } };

describe("time-trouble", () => {
  it("flags a mistake with 15 s left in 180+0 (threshold 18 s)", async () => {
    const g = await fixtureGame({ pgn: pgn(15), as: "white", timeControl: "180+0", timeClass: "blitz", evals: MISTAKE });
    expect(timeTrouble.detect(g)).toMatchObject([{ ply: 5, evidence: "mistake with 15 s left" }]);
  });

  it("does not flag the same mistake with 40 s left", async () => {
    const g = await fixtureGame({ pgn: pgn(40), as: "white", timeControl: "180+0", timeClass: "blitz", evals: MISTAKE });
    expect(timeTrouble.detect(g)).toEqual([]);
  });

  it("uses a 26 s threshold for 180+2", async () => {
    const at = (left: number) =>
      fixtureGame({ pgn: pgn(left), as: "white", timeControl: "180+2", timeClass: "blitz", evals: MISTAKE });
    expect(timeTrouble.detect(await at(25))).toMatchObject([{ ply: 5 }]);
    expect(timeTrouble.detect(await at(26))).toEqual([]);
  });

  it("does not flag a sound move made in time trouble", async () => {
    const g = await fixtureGame({ pgn: pgn(5), as: "white", timeControl: "180+0", timeClass: "blitz" });
    expect(timeTrouble.detect(g)).toEqual([]);
  });

  it("skips daily games", async () => {
    const g = await fixtureGame({ pgn: pgn(15), as: "white", timeControl: "1/86400", timeClass: "daily", evals: MISTAKE });
    expect(timeTrouble.detect(g)).toEqual([]);
  });

  it("skips games whose PGN has no clocks", async () => {
    const g = await fixtureGame({ pgn: pgn(undefined), as: "white", timeControl: "180+0", timeClass: "blitz", evals: MISTAKE });
    expect(timeTrouble.detect(g)).toEqual([]);
  });
});
