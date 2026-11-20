import { PATTERN_IDS, type PatternFinding, type PatternSummary } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { type GameLookup, NOTHING_ELIGIBLE, formatPatterns } from "./patterns-format";

const FEN = "3q3k/6pp/8/4N3/8/8/6PP/6K1 w - - 0 1";

const finding = (patternId: string, gameId: string, ply: number, winPctLoss: number): PatternFinding => ({
  patternId,
  gameId,
  ply,
  winPctLoss,
  evidence: `${patternId} evidence`,
});

function summary(over: Partial<PatternSummary> = {}): PatternSummary {
  return {
    player: "test-player",
    patternsVersion: 1,
    analysisVersion: 2,
    engine: { name: "Stub 1", depth: 12 },
    games: 4,
    moves: 200,
    mistakesPer100Moves: 6.5,
    stats: PATTERN_IDS.map((patternId) => ({
      patternId,
      games: 4,
      moves: 200,
      gamesAffected: patternId === "hung-piece" ? 3 : 0,
      occurrences: patternId === "hung-piece" ? 4 : 0,
      per100Moves: patternId === "hung-piece" ? 2 : 0,
      avgWinPctLoss: patternId === "hung-piece" ? 30 : 0,
    })),
    findings: [],
    openings: [],
    top: [],
    ...over,
  };
}

const lookup: GameLookup = (id) => ({
  record: { url: `https://lichess.org/${id}`, platform: "lichess" },
  analysis: {
    moves: [
      {
        ply: 23,
        color: "white",
        san: "Nf7+",
        uci: "e5f7",
        fenBefore: FEN,
        fenAfter: FEN,
        scoreBefore: { cp: 0 },
        scoreAfter: { cp: 0 },
        winPctBefore: 50,
        winPctAfter: 20,
        winPctLoss: 30,
        judgment: "blunder",
      },
    ],
  },
});

const top3 = summary({
  top: [
    { patternId: "hung-piece", costPer100Moves: 6, gamesAffected: 3, examples: [finding("hung-piece", "g1", 23, 40), finding("hung-piece", "g2", 23, 30)] },
    { patternId: "allowed-tactic", costPer100Moves: 4, gamesAffected: 2, examples: [finding("allowed-tactic", "g3", 23, 20)] },
    { patternId: "opening-trouble", costPer100Moves: 1.5, gamesAffected: 2, examples: [] },
  ],
});

describe("formatPatterns", () => {
  it("leads with a header and the top habits in summary order", () => {
    const out = formatPatterns(top3, lookup);
    const lines = out.split("\n");
    expect(lines[0]).toBe("test-player: 4 games, 200 moves, 6.5 mistakes per 100 moves (Stub 1, depth 12)");
    const a = out.indexOf("1. Left a piece hanging (hung-piece)");
    const b = out.indexOf("2. Allowed a tactic (allowed-tactic)");
    const c = out.indexOf("3. Same opening mistake again (opening-trouble)");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(out).toContain("costs 6.0 win% per 100 moves, in 3 of 4 games");
    expect(out).toContain("12.Nf7+  https://lichess.org/g1#23");
    expect(out).toContain(`FEN ${FEN}`);
    expect(out).toContain("hung-piece evidence (-40.0 win%)");
    expect(out).not.toContain("All patterns");
  });

  it("prints exactly the nothing-eligible message when no habit qualifies", () => {
    const out = formatPatterns(summary(), lookup);
    expect(out.split("\n").slice(2)).toEqual([NOTHING_ELIGIBLE]);
    expect(NOTHING_ELIGIBLE).toBe("No habit repeated in two or more games yet.");
  });

  it("caps examples per habit", () => {
    const count = (out: string) => (out.match(/https:\/\/lichess\.org\/g/g) ?? []).length;
    expect(count(formatPatterns(top3, lookup))).toBe(3);
    expect(count(formatPatterns(top3, lookup, { examples: 1 }))).toBe(2);
    expect(count(formatPatterns(top3, lookup, { examples: 0 }))).toBe(0);
    expect(count(formatPatterns(top3, lookup, { examples: 5 }))).toBe(3);
  });

  it("falls back to the game id when the record is unknown, and drops the ply for other platforms", () => {
    expect(formatPatterns(top3, () => undefined)).toContain("12. (ply 23)  g1");
    const cc: GameLookup = (id) => ({ record: { url: `https://www.chess.com/game/live/${id}`, platform: "chesscom" } });
    expect(formatPatterns(top3, cc)).toContain("https://www.chess.com/game/live/g1\n");
  });

  it("with all, prints every pattern including zero rows and the no-opening message", () => {
    const out = formatPatterns(summary(), lookup, { all: true });
    const rows = out.split("\n");
    const head = rows.findIndex((l) => l.startsWith("Pattern"));
    expect(head).toBeGreaterThan(0);
    const body = rows.slice(head + 1, head + 1 + PATTERN_IDS.length);
    expect(body).toHaveLength(9);
    expect(body.find((l) => l.startsWith("Left a piece hanging"))).toMatch(/2\.0\s+4\s+3\/4\s+30\.0$/);
    expect(body.find((l) => l.startsWith("Missed a mate"))).toMatch(/0\.0\s+0\s+0\/4\s+0\.0$/);
    expect(out).toContain("No opening mistake repeated in these 4 games.");
  });

  it("with all, lists repeated openings", () => {
    const out = formatPatterns(
      summary({
        openings: [
          {
            positionKey: "k",
            color: "black",
            line: ["e4", "e5", "Nf3"],
            eco: "C40",
            name: "King's Knight Opening",
            games: 3,
            reached: 4,
            movesPlayed: ["Bc5", "Bc5", "f6"],
            bestMove: "Nc6",
            avgWinPctLoss: 12,
            gameIds: ["g1", "g2", "g3"],
          },
        ],
      }),
      lookup,
      { all: true },
    );
    expect(out).toContain("- e4 e5 Nf3  [C40 King's Knight Opening], as black");
    expect(out).toContain("went wrong in 3 of 4 games reaching it; played Bc5, Bc5, f6, best Nc6; avg -12.0 win%");
    expect(out).not.toContain("No opening mistake repeated");
  });
});
