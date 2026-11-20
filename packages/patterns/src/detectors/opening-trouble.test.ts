import { describe, expect, it } from "vitest";
import { positionKey } from "../board";
import { openingStats, summarize } from "../aggregate";
import { findPatterns } from "../find";
import { FIXTURE_PLAYERS, fixtureGame, type ScriptedEval } from "../test-fixtures";
import type { PlayerGame } from "../types";
import { openingTrouble } from "./opening-trouble";

/** Black to move after 1.e4 e5 2.Nf3. */
const AFTER_NF3 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -";

/** Scores from White's side: 0 -> +146 costs the black mover about 13 win%. */
const EVEN: ScriptedEval = { cp: 0, pv: ["Nc6"] };
const WORSE: ScriptedEval = { cp: 146 };

/** 1.e4 e5 2.Nf3 Bc5 3.c3 from Black's side, 2...Bc5 scripted at about -13 win%. */
function bc5(id: string): Promise<PlayerGame> {
  return fixtureGame({ id, pgn: "1. e4 e5 2. Nf3 Bc5 3. c3", as: "black", evals: { 4: EVEN, 5: WORSE } });
}

/** Thirteen moves of a Ruy Lopez, so plies 24 (12...Re8) and 25 (13.Nf1) exist. */
const LONG =
  "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O " +
  "9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 14. Ng3";

describe("openingTrouble", () => {
  it("flags a position that was a mistake in three games, once per game", async () => {
    const games = await Promise.all([bc5("ot:a"), bc5("ot:b"), bc5("ot:c")]);
    const hits = openingTrouble.detect(games);
    expect(hits).toHaveLength(3);
    for (const h of hits) {
      expect(h).toMatchObject({ ply: 4, subject: positionKey(AFTER_NF3) });
      expect(h.winPctLoss).toBeCloseTo(13, 0);
      expect(h.evidence).toBe("after 1.e4 e5 2.Nf3: played Bc5 (mistake here in 3 games); engine prefers Nc6");
    }
    expect(hits.map((h) => h.gameId)).toEqual(["ot:a", "ot:b", "ot:c"]);

    const summary = summarize(FIXTURE_PLAYERS.black, games);
    expect(summary.findings.filter((f) => f.patternId === "opening-trouble")).toHaveLength(3);
    expect(summary.openings).toEqual([
      {
        positionKey: positionKey(AFTER_NF3),
        color: "black",
        line: ["e4", "e5", "Nf3"],
        games: 3,
        reached: 3,
        movesPlayed: ["Bc5", "Bc5", "Bc5"],
        bestMove: "Nc6",
        avgWinPctLoss: expect.closeTo(13, 0),
        gameIds: ["ot:a", "ot:b", "ot:c"],
      },
    ]);
  });

  it("counts a game that reached the position and played well in reached, not games", async () => {
    const games = await Promise.all([
      bc5("ot:a"),
      bc5("ot:b"),
      bc5("ot:c"),
      fixtureGame({ id: "ot:d", pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5", as: "black", evals: { 4: EVEN } }),
    ]);
    expect(openingTrouble.detect(games).map((h) => h.gameId)).toEqual(["ot:a", "ot:b", "ot:c"]);
    const [stat] = openingStats(games, findPatterns(games, [openingTrouble]));
    expect(stat).toMatchObject({ games: 3, reached: 4 });
  });

  it("gives the same hits whatever order the games come in", async () => {
    const games = await Promise.all([bc5("ot:a"), bc5("ot:b"), bc5("ot:c")]);
    const reversed = [...games].reverse();
    expect(openingTrouble.detect(reversed)).toEqual(openingTrouble.detect(games));
  });

  it("counts ply 24 but ignores a repeated mistake past it", async () => {
    const at = (ply: number) => (id: string) =>
      fixtureGame({
        id,
        pgn: LONG,
        as: ply % 2 === 0 ? "black" : "white",
        evals: { [ply]: { cp: 0 }, [ply + 1]: { cp: ply % 2 === 0 ? 146 : -146 } },
      });
    const ply24 = await Promise.all([at(24)("ot:24a"), at(24)("ot:24b")]);
    expect(openingTrouble.detect(ply24).map((h) => h.ply)).toEqual([24, 24]);

    const ply25 = await Promise.all([at(25)("ot:25a"), at(25)("ot:25b")]);
    expect(ply25[0]!.analysis.moves.find((m) => m.ply === 25)!.winPctLoss).toBeGreaterThan(10);
    expect(openingTrouble.detect(ply25)).toEqual([]);
  });

  it("gives nothing for a mistake in only one game", async () => {
    const games = await Promise.all([
      bc5("ot:a"),
      fixtureGame({ id: "ot:b", pgn: "1. e4 e5 2. Nf3 Bc5 3. c3", as: "black" }),
    ]);
    expect(openingTrouble.detect(games)).toEqual([]);
    expect(summarize(FIXTURE_PLAYERS.black, games).openings).toEqual([]);
  });

  it("groups the same position reached by different move orders", async () => {
    // Black to move after 1.e4 e5 2.Nf3 Nc6 3.Bc4 and after 1.e4 e5 2.Bc4 Nc6 3.Nf3.
    const games = await Promise.all([
      fixtureGame({ id: "ot:x", pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. c3", as: "black", evals: { 6: { cp: 0, pv: ["Nf6"] }, 7: WORSE } }),
      fixtureGame({ id: "ot:y", pgn: "1. e4 e5 2. Bc4 Nc6 3. Nf3 Nd4 4. c3", as: "black", evals: { 6: { cp: 0, pv: ["Nf6"] }, 7: WORSE } }),
    ]);
    const hits = openingTrouble.detect(games);
    expect(hits).toHaveLength(2);
    expect(new Set(hits.map((h) => h.subject)).size).toBe(1);
    expect(hits[0]!.evidence).toContain("after 1.e4 e5 2.Nf3 Nc6 3.Bc4: played Nd4");
    expect(hits[1]!.evidence).toContain("after 1.e4 e5 2.Bc4 Nc6 3.Nf3: played Nd4");
    const [stat] = summarize(FIXTURE_PLAYERS.black, games).openings;
    expect(stat).toMatchObject({ games: 2, reached: 2, gameIds: ["ot:x", "ot:y"] });
  });

  it("does not count a mistake set aside by the winning-anyway rule", async () => {
    // Black is far ahead: -2000 -> -500 still loses over 10 win% but leaves Black above 80.
    const stillWinning = await fixtureGame({
      id: "ot:w",
      pgn: "1. e4 e5 2. Nf3 Bc5 3. c3",
      as: "black",
      evals: { 4: { cp: -2000, pv: ["Nc6"] }, 5: { cp: -500 } },
    });
    const m = stillWinning.analysis.moves.find((x) => x.ply === 4)!;
    expect(m.winPctLoss).toBeGreaterThanOrEqual(10);
    expect(m.winPctAfter).toBeGreaterThanOrEqual(80);

    const games = [await bc5("ot:a"), stillWinning];
    expect(openingTrouble.detect(games)).toEqual([]);
    expect(summarize(FIXTURE_PLAYERS.black, games).openings).toEqual([]);
  });
});
