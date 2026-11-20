import { analyzeGame } from "@blunderstruck/engine";
import { describe, expect, it } from "vitest";
import { clockBefore, lostOnTime, mateFor, moveAt, parseClock, playerMoves, replyTo, toPlayerGame } from "./game";
import { FIXTURE_PLAYERS, fixtureAnalysis, fixtureGame, fixtureRecord, scriptedEvaluator } from "./test-fixtures";

const PGN = "1. e4 { [%clk 0:02:58] } e5 { [%clk 0:02:59] } 2. Nf3 { [%clk 0:02:40] } Nc6 { [%clk 0:02:30] } 3. Bb5 { [%clk 0:02:20] }";

describe("parseClock", () => {
  it("reads base+increment and skips daily or unreadable controls", () => {
    expect(parseClock("180+2")).toEqual({ baseSeconds: 180, incrementSeconds: 2 });
    expect(parseClock("600")).toEqual({ baseSeconds: 600, incrementSeconds: 0 });
    expect(parseClock("1/86400")).toBeUndefined();
    expect(parseClock("3d")).toBeUndefined();
    expect(parseClock("-")).toBeUndefined();
    expect(parseClock("600+5", "daily")).toBeUndefined();
  });
});

describe("toPlayerGame", () => {
  it("joins record and analysis from the player's side", async () => {
    const o = { pgn: PGN, result: "black" as const, timeControl: "180+2", termination: "resign", opening: { eco: "C60" } };
    const record = fixtureRecord(o);
    const analysis = await fixtureAnalysis(o, record);
    const g = toPlayerGame(record, analysis, FIXTURE_PLAYERS.black.toUpperCase())!;
    expect(g).toMatchObject({
      color: "black",
      outcome: "win",
      clock: { baseSeconds: 180, incrementSeconds: 2 },
      termination: "resign",
      opening: { eco: "C60" },
    });
    expect(toPlayerGame(record, analysis, FIXTURE_PLAYERS.white)!.outcome).toBe("loss");
    expect(toPlayerGame(record, analysis, "someone-else")).toBeNull();
  });

  it("refuses another game's, an old or a one-sided analysis", async () => {
    const o = { pgn: PGN };
    const record = fixtureRecord(o);
    const analysis = await fixtureAnalysis(o, record);
    expect(() => toPlayerGame({ ...record, id: "other" }, analysis, FIXTURE_PLAYERS.white)).toThrow(/not other/);
    expect(() => toPlayerGame(record, { ...analysis, analysisVersion: 1 }, FIXTURE_PLAYERS.white)).toThrow(/version 1/);
    const oneSided = await analyzeGame(scriptedEvaluator(new Map()), record, { only: "white" });
    expect(() => toPlayerGame(record, oneSided, FIXTURE_PLAYERS.white)).toThrow(/full game/);
  });
});

describe("move helpers", () => {
  it("iterates own moves and finds replies and clocks", async () => {
    const g = await fixtureGame({ pgn: PGN, as: "white", timeControl: "180+0" });
    const own = playerMoves(g);
    expect(own.map((m) => m.san)).toEqual(["e4", "Nf3", "Bb5"]);
    expect(replyTo(g, own[0]!)!.san).toBe("e5");
    expect(replyTo(g, own[2]!)).toBeUndefined();
    expect(moveAt(g, 4)!.san).toBe("Nc6");
    expect(moveAt(g, 99)).toBeUndefined();
    expect(own.map((m) => clockBefore(g, m))).toEqual([180, 178, 160]);

    const daily = await fixtureGame({ pgn: PGN, as: "white", timeControl: "1/86400", timeClass: "daily" });
    expect(clockBefore(daily, playerMoves(daily)[1]!)).toBeUndefined();
    const noClk = await fixtureGame({ pgn: "1. e4 e5 2. Nf3", as: "white", timeControl: "180+0" });
    expect(clockBefore(noClk, playerMoves(noClk)[1]!)).toBeUndefined();
  });

  it("knows a time loss and reads mate scores from either side", async () => {
    const lost = await fixtureGame({ pgn: PGN, as: "white", result: "black", termination: "outoftime" });
    expect(lostOnTime(lost)).toBe(true);
    const won = await fixtureGame({ pgn: PGN, as: "black", result: "black", termination: "timeout" });
    expect(lostOnTime(won)).toBe(false);
    expect(mateFor({ mate: 2 }, "white")).toBe(2);
    expect(mateFor({ mate: 2 }, "black")).toBe(-2);
    expect(mateFor({ cp: 30 }, "white")).toBeUndefined();
  });
});

describe("fixture helper", () => {
  it("scripts scores from White's side, by ply or FEN, with SAN or UCI lines", async () => {
    const g = await fixtureGame({
      pgn: "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Ba6 bxa6",
      as: "white",
      result: "black",
      evals: {
        7: { cp: 20, pv: ["Bb5", "Nd4"] },
        "r1bqkb1r/pppp1ppp/B1n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 5 4": { cp: -618, pv: ["b7a6"] },
      },
    });
    const ba6 = moveAt(g, 7)!;
    expect(ba6).toMatchObject({ san: "Ba6", bestUci: "f1b5", bestLine: ["f1b5", "c6d4"], scoreAfter: { cp: -618 } });
    expect(ba6.winPctLoss).toBeGreaterThan(40);
    expect(moveAt(g, 8)).toMatchObject({ san: "bxa6", bestUci: "b7a6", bestLine: ["b7a6"] });
    expect(moveAt(g, 1)!.bestUci).toBeUndefined();
    await expect(fixtureGame({ pgn: "1. e4", as: "white", evals: { 1: { pv: ["Ke2"] } } })).rejects.toThrow(/not a legal/);
  });
});
