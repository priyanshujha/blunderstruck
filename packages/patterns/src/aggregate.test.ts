import { PATTERN_IDS, type PatternFinding, PatternSummary } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { openingStats, patternStats, rankTop, summarize } from "./aggregate";
import { positionKey } from "./board";
import { moveAt, playerMoves } from "./game";
import { fixtureGame } from "./test-fixtures";
import type { GameDetector, PlayerGame, SetDetector } from "./types";

const f = (patternId: string, gameId: string, ply: number, winPctLoss: number): PatternFinding => ({
  patternId,
  gameId,
  ply,
  winPctLoss,
  evidence: `${patternId} ${gameId}:${ply}`,
});

const MOVES = 100;
const top = (findings: PatternFinding[], moves = MOVES) =>
  rankTop(patternStats(5, moves, findings), findings, moves);

describe("rankTop", () => {
  it("leaves out a one-off and a pattern seen twice in one game", () => {
    const findings = [
      f("missed-mate", "g1", 9, 90),
      f("allowed-mate", "g2", 11, 40),
      f("allowed-mate", "g2", 21, 40),
      f("hung-piece", "g1", 7, 20),
      f("hung-piece", "g3", 7, 10),
    ];
    expect(top(findings)).toEqual([
      {
        patternId: "hung-piece",
        costPer100Moves: 30,
        gamesAffected: 2,
        examples: [findings[3], findings[4]],
      },
    ]);
  });

  it("gives a situation pattern on already explained plies zero marginal cost", () => {
    const findings = [
      f("hung-piece", "g1", 7, 30),
      f("hung-piece", "g2", 9, 30),
      f("thrown-win", "g1", 7, 30),
      f("thrown-win", "g2", 9, 30),
      f("time-trouble", "g1", 7, 5),
      f("time-trouble", "g3", 31, 5),
    ];
    // time-trouble keeps only g3:31 after hung-piece covers g1:7: one finding, not eligible.
    expect(top(findings).map((h) => h.patternId)).toEqual(["hung-piece"]);
  });

  it("charges each pattern only for what earlier picks left unexplained", () => {
    const findings = [
      f("allowed-tactic", "g1", 7, 40),
      f("allowed-tactic", "g2", 9, 40),
      f("thrown-win", "g1", 7, 40),
      f("thrown-win", "g2", 15, 25),
      f("thrown-win", "g3", 15, 25),
    ];
    const t = top(findings);
    // thrown-win alone costs 90 > 80, so it goes first; then allowed-tactic keeps only g2:9.
    expect(t.map((h) => [h.patternId, h.costPer100Moves])).toEqual([["thrown-win", 90]]);
  });

  it("breaks ties by games affected, then occurrences, then PATTERN_IDS order", () => {
    // Same cost (40): missed-tactic in 3 games beats hung-piece in 2.
    const byGames = [
      f("hung-piece", "g1", 7, 20),
      f("hung-piece", "g2", 7, 20),
      f("missed-tactic", "g1", 9, 10),
      f("missed-tactic", "g2", 9, 10),
      f("missed-tactic", "g3", 9, 20),
    ];
    expect(top(byGames).map((h) => h.patternId)).toEqual(["missed-tactic", "hung-piece"]);
    // Same cost and games: more occurrences first.
    const byCount = [
      f("hung-piece", "g1", 7, 20),
      f("hung-piece", "g2", 7, 20),
      f("missed-tactic", "g1", 9, 10),
      f("missed-tactic", "g1", 11, 10),
      f("missed-tactic", "g2", 9, 20),
    ];
    expect(top(byCount).map((h) => h.patternId)).toEqual(["missed-tactic", "hung-piece"]);
    // All equal: PATTERN_IDS order, whatever order the stats come in.
    const equal = [
      f("time-trouble", "g1", 7, 20),
      f("time-trouble", "g2", 7, 20),
      f("allowed-mate", "g1", 9, 20),
      f("allowed-mate", "g2", 9, 20),
    ];
    const stats = patternStats(2, MOVES, equal).reverse();
    expect(rankTop(stats, equal, MOVES).map((h) => h.patternId)).toEqual(["allowed-mate", "time-trouble"]);
  });

  it("stops at three and picks examples from separate games first", () => {
    const findings = [
      ...["missed-mate", "allowed-mate", "hung-piece", "missed-tactic"].flatMap((id, i) => [
        f(id, "g1", 10 + 2 * i, 50 - i),
        f(id, "g1", 30 + 2 * i, 45 - i),
        f(id, "g2", 10 + 2 * i, 20 - i),
      ]),
    ];
    const t = top(findings);
    expect(t.map((h) => h.patternId)).toEqual(["missed-mate", "allowed-mate", "hung-piece"]);
    expect(t[0]!.examples.map((e) => `${e.gameId}:${e.ply}`)).toEqual(["g1:10", "g2:10"]);
  });

  it("takes a second example about a different subject, or gives only one", () => {
    const s = (x: PatternFinding, subject: string): PatternFinding => ({ ...x, subject });
    const same = [s(f("opening-trouble", "g1", 4, 30), "A"), s(f("opening-trouble", "g2", 4, 20), "A")];
    expect(top(same)[0]!.examples).toEqual([same[0]]);
    const two = [
      s(f("opening-trouble", "g1", 4, 30), "A"),
      s(f("opening-trouble", "g2", 4, 25), "A"),
      s(f("opening-trouble", "g1", 6, 5), "B"),
      s(f("opening-trouble", "g3", 6, 4), "B"),
    ];
    // Different subject first; among those, another game than the first example's.
    expect(top(two)[0]!.examples).toEqual([two[0], two[3]]);
  });

  it("is empty when nothing is eligible or there are no moves", () => {
    expect(top([f("hung-piece", "g1", 7, 20)])).toEqual([]);
    expect(top([])).toEqual([]);
    expect(top([f("hung-piece", "g1", 7, 20), f("hung-piece", "g2", 7, 20)], 0)).toEqual([]);
  });
});

// Black plays 2...Bc5 (scripted as a mistake) in three games; a fourth plays 2...Nc6.
const BC5 = "1. e4 e5 2. Nf3 Bc5 3. Nxe5";
const NC6 = "1. e4 e5 2. Nf3 Nc6 3. Bb5";
const evals = { 4: { cp: 30, pv: ["Nc6", "Bb5"] }, 5: { cp: 160 } };
const opening = { eco: "C40", name: "King's Knight Opening" };
const blackGames = (): Promise<PlayerGame[]> =>
  Promise.all([
    fixtureGame({ id: "g1", pgn: BC5, as: "black", evals, opening }),
    fixtureGame({ id: "g2", pgn: BC5, as: "black", evals }),
    fixtureGame({ id: "g3", pgn: BC5, as: "black", evals }),
    fixtureGame({ id: "g4", pgn: NC6, as: "black", evals }),
  ]);

describe("openingStats", () => {
  it("groups opening-trouble findings by position", async () => {
    const games = await blackGames();
    const key = positionKey(moveAt(games[0]!, 4)!.fenBefore);
    const findings = games.slice(0, 3).map((g, i): PatternFinding => ({
      ...f("opening-trouble", g.analysis.gameId, 4, 10 + i),
      subject: key,
    }));
    findings.push(f("hung-piece", "g1", 4, 50));
    expect(openingStats(games, findings)).toEqual([
      {
        positionKey: key,
        color: "black",
        line: ["e4", "e5", "Nf3"],
        eco: "C40",
        name: "King's Knight Opening",
        games: 3,
        reached: 4,
        movesPlayed: ["Bc5", "Bc5", "Bc5"],
        bestMove: "Nc6",
        avgWinPctLoss: 11,
        gameIds: ["g1", "g2", "g3"],
      },
    ]);
    expect(openingStats(games, [])).toEqual([]);
  });
});

/** Flags every player move losing at least 10 win% as hung-piece (a stand-in detector). */
const everyMistake: GameDetector = {
  id: "hung-piece",
  scope: "game",
  family: "tactical",
  detect: (g) =>
    playerMoves(g)
      .filter((m) => m.winPctLoss >= 10)
      .map((m) => ({ gameId: g.analysis.gameId, ply: m.ply, winPctLoss: m.winPctLoss, evidence: m.san })),
};
const sameOpening: SetDetector = {
  id: "opening-trouble",
  scope: "set",
  family: "context",
  detect: (gs) =>
    gs.flatMap((g) => {
      const m = moveAt(g, 4)!;
      return m.san === "Bc5"
        ? [{ gameId: g.analysis.gameId, ply: 4, winPctLoss: m.winPctLoss, evidence: "", subject: positionKey(m.fenBefore) }]
        : [];
    }),
};

describe("summarize", () => {
  it("lists every pattern, counts moves and mistakes, and fills openings and top", async () => {
    const games = await blackGames();
    const s = summarize("fixture-black", games, [everyMistake, sameOpening]);
    expect(PatternSummary.parse(s)).toEqual(s);
    expect(s).toMatchObject({ player: "fixture-black", games: 4, moves: 8, engine: { name: "stub", depth: 1 } });
    expect(s.stats.map((x) => x.patternId)).toEqual([...PATTERN_IDS]);
    const loss = moveAt(games[0]!, 4)!.winPctLoss;
    expect(loss).toBeGreaterThan(10);
    expect(s.mistakesPer100Moves).toBeCloseTo(300 / 8);
    expect(s.stats.find((x) => x.patternId === "hung-piece")).toEqual({
      patternId: "hung-piece",
      games: 4,
      moves: 8,
      gamesAffected: 3,
      occurrences: 3,
      per100Moves: 300 / 8,
      avgWinPctLoss: loss,
    });
    expect(s.stats.find((x) => x.patternId === "missed-mate")).toMatchObject({ occurrences: 0, avgWinPctLoss: 0, per100Moves: 0 });
    expect(s.findings).toHaveLength(6);
    expect(s.openings).toHaveLength(1);
    // opening-trouble sits on the plies hung-piece already explains.
    expect(s.top.map((h) => h.patternId)).toEqual(["hung-piece"]);
  });

  it("is the same for any order of the input games", async () => {
    const games = await blackGames();
    const extra = await fixtureGame({ id: "g0", pgn: BC5, as: "black", evals: { 4: { cp: 30, pv: ["Nf6"] }, 5: { cp: 170 } } });
    const all = [...games, extra];
    for (const detectors of [[everyMistake, sameOpening], undefined]) {
      const base = summarize("fixture-black", all, detectors);
      expect(summarize("fixture-black", [...all].reverse(), detectors)).toEqual(base);
      const [a, b, c, d, e] = all;
      expect(summarize("fixture-black", [c!, a!, e!, d!, b!], detectors)).toEqual(base);
      if (detectors) {
        expect(base.openings[0]).toMatchObject({ gameIds: ["g0", "g1", "g2", "g3"], bestMove: "Nf6" });
        expect(base.findings.map((x) => x.gameId)).toEqual([...base.findings.map((x) => x.gameId)].sort());
      }
    }
  });

  it("gives zeros for no games or no moves", async () => {
    const empty = summarize("nobody", []);
    expect(empty).toMatchObject({ games: 0, moves: 0, mistakesPer100Moves: 0, findings: [], openings: [], top: [] });
    expect(empty.engine).toEqual({ name: "", depth: 0 });
    expect(empty.stats).toHaveLength(PATTERN_IDS.length);
    const noMoves = await fixtureGame({ pgn: "", as: "white" });
    expect(summarize("fixture-white", [noMoves]).stats.every((x) => x.per100Moves === 0)).toBe(true);
  });

  it("refuses to mix analysis versions or depths", async () => {
    const a = await fixtureGame({ pgn: "1. e4 e5", as: "white" });
    const b = await fixtureGame({ pgn: "1. d4 d5", as: "white", depth: 2 });
    expect(() => summarize("p", [a, b])).toThrow(/depths/);
    const old = { ...a, analysis: { ...a.analysis, analysisVersion: 1 } };
    expect(() => summarize("p", [old])).toThrow(/version 1/);
  });
});
