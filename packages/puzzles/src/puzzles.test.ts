import { PuzzleCandidate } from "@blunderstruck/contracts";
import type { EvalResult, Evaluator } from "@blunderstruck/engine";
import { describe, expect, it } from "vitest";
import { acceptedSet } from "./accept";
import { MultiPvUnsupportedError, buildPuzzleCandidates } from "./build";
import { legalMoveCount, puzzlePositions, selectPositions } from "./candidates";
import { MAX_PER_GAME, MAX_PER_RUN, PATTERN_PUZZLE_KINDS, positionKey } from "./rules";
import { START_FEN, finding, gameFromSans, seededGame, stubEvaluator } from "./test-fixtures";

const SCHOLAR = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
const KNIGHT_TAKES = "rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5";
const BLACK_DEFENDS = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3";

// Black's ...Nf6?? at ply 10 (two knight moves each way first, so it is late enough).
const scholar = gameFromSans("g-scholar", ["e4", "e5", "Nf3", "Nf6", "Ng1", "Ng8", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
// Black's ...g6? at ply 8 lets Nxe5.
const knight = gameFromSans("g-knight", ["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "Nc3", "g6", "Nxe5"]);
// Black's ...Nd4?? at ply 6 allows Qxf7#; counted as opening trouble.
const defends = gameFromSans("g-defends", ["e4", "e5", "Qf3", "Nc6", "Bc4", "Nd4", "Qxf7#"]);
// White's first move, counted as opening trouble.
const start = gameFromSans("g-start", ["a4", "e5"]);

const cp = (move: string, value: number): EvalResult => ({ score: { cp: value }, depth: 18, bestMove: move, pv: [move] });
const mate = (move: string, n: number): EvalResult => ({ score: { mate: n }, depth: 18, bestMove: move, pv: [move] });

async function build(games: Parameters<typeof buildPuzzleCandidates>[0]["games"], findings: Parameters<typeof buildPuzzleCandidates>[0]["findings"], extra: Partial<Parameters<typeof buildPuzzleCandidates>[0]> = {}) {
  const evaluator = stubEvaluator();
  const skipped: string[] = [];
  const out = await buildPuzzleCandidates({
    games,
    findings,
    evaluator,
    onSkip: (p, reason) => skipped.push(`${p.gameId}~${p.ply}: ${reason}`),
    ...extra,
  });
  for (const c of out) PuzzleCandidate.parse(c);
  return { out, skipped, evaluator };
}

describe("fixtures", () => {
  it("reach the four checked positions", () => {
    expect(positionKey(scholar.moves[9]!.fenAfter)).toBe(positionKey(SCHOLAR));
    expect(positionKey(knight.moves[7]!.fenAfter)).toBe(positionKey(KNIGHT_TAKES));
    expect(defends.moves[5]!.fenBefore).toBe(BLACK_DEFENDS);
    expect(start.moves[0]!.fenBefore).toBe(START_FEN);
  });
});

describe("rules", () => {
  it("gives each pattern the puzzle its mistake suggests", () => {
    expect(PATTERN_PUZZLE_KINDS["missed-mate"]).toEqual(["do-over"]);
    expect(PATTERN_PUZZLE_KINDS["hung-piece"]).toEqual(["punish"]);
    expect(PATTERN_PUZZLE_KINDS["allowed-tactic"]).toEqual(["punish"]);
    expect(PATTERN_PUZZLE_KINDS["opening-trouble"]).toEqual(["do-over"]);
    expect(PATTERN_PUZZLE_KINDS["time-trouble"]).toEqual([]);
  });

  it("counts legal moves, each promotion piece separately", () => {
    expect(legalMoveCount(START_FEN)).toBe(20);
    expect(legalMoveCount("8/P7/8/8/8/8/8/k6K w - - 0 1")).toBe(7);
    expect(legalMoveCount("not a fen")).toBeUndefined();
  });
});

describe("acceptedSet", () => {
  it("accepts moves within 5 win% of the best and closes on line 5", () => {
    const set = acceptedSet([cp("a", 30), cp("b", 20), cp("c", -10), cp("d", -20), cp("e", -53)], 30);
    expect(set?.accepted).toEqual(["a", "b", "c", "d"]);
    expect(set?.closed).toBe(true);
  });

  it("is open when line 5 is still within the margin", () => {
    const set = acceptedSet([cp("a", 30), cp("b", 28), cp("c", 26), cp("d", 25), cp("e", 22)], 20);
    expect(set?.closed).toBe(false);
  });

  it("is closed with fewer legal moves than lines", () => {
    const set = acceptedSet([cp("a", 0), cp("b", 0), cp("c", 0), cp("d", 0)], 4);
    expect(set).toMatchObject({ accepted: ["a", "b", "c", "d"], closed: true });
  });

  it("accepts only mates as fast as a forced mate, never a slower mate or a big win", () => {
    const set = acceptedSet([mate("a", 2), mate("b", 3), cp("c", 900), cp("d", 0), cp("e", -50)], 30);
    expect(set).toMatchObject({ accepted: ["a"], closed: true, mateIn: 2 });
    const two = acceptedSet([mate("a", 2), mate("b", 1), mate("c", 4), cp("d", 0), cp("e", 0)], 30);
    expect(two?.accepted).toEqual(["a", "b"]);
  });

  it("is open when every line mates as fast", () => {
    const set = acceptedSet(["a", "b", "c", "d", "e"].map((m) => mate(m, 1)), 30);
    expect(set?.closed).toBe(false);
  });

  it("gives nothing when the engine gives no move", () => {
    expect(acceptedSet([], 20)).toBeUndefined();
  });
});

describe("buildPuzzleCandidates", () => {
  it("keeps the mate-in-1 punish as {h5f7}", async () => {
    const { out } = await build([scholar], [finding("g-scholar", 10, "allowed-mate")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "g-scholar~10~punish",
      kind: "punish",
      fen: scholar.moves[9]!.fenAfter,
      solver: "white",
      accepted: ["h5f7"],
      played: { uci: "g8f6", san: "Nf6" },
      prevMove: { uci: "g8f6", san: "Nf6" },
      reply: { uci: "h5f7", san: "Qxf7#" },
      engine: { name: "stub-fish", depth: 18, lines: 5 },
      puzzleVersion: 1,
    });
  });

  it("keeps the Nxe5 punish as {f3e5}, with the best line", async () => {
    const { out } = await build([knight], [{ ...finding("g-knight", 8, "allowed-tactic", 12.5), motif: "fork" }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      accepted: ["f3e5"],
      line: ["f3e5", "d6e5", "d1g4"],
      motif: "fork",
      winPctLoss: 12.5,
      solver: "white",
    });
  });

  it("keeps the Black do-over as its four defences, with the move before it", async () => {
    const { out } = await build([defends], [finding("g-defends", 6, "opening-trouble")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "g-defends~6~do-over",
      kind: "do-over",
      fen: BLACK_DEFENDS,
      solver: "black",
      accepted: ["g8f6", "d8f6", "f7f5", "d8e7"],
      played: { uci: "c6d4", san: "Nd4" },
      prevMove: { uci: "f1c4", san: "Bc4" },
      reply: { uci: "f3f7", san: "Qxf7#" },
    });
  });

  it("drops the start position as open, with no move before it", async () => {
    const positions = puzzlePositions([start], [finding("g-start", 1, "opening-trouble")]);
    expect(positions[0]?.prevMove).toBeUndefined();
    const { out, skipped } = await build([start], [finding("g-start", 1, "opening-trouble")]);
    expect(out).toEqual([]);
    expect(skipped).toEqual(["g-start~1: too many moves are about as good"]);
  });

  it("drops a do-over whose played move is one of the answers", async () => {
    const played = gameFromSans("g-played", ["e4", "e5", "Qf3", "Nc6", "Bc4", "Nf6"]);
    const { out, skipped } = await build([played], [finding("g-played", 6, "opening-trouble")]);
    expect(out).toEqual([]);
    expect(skipped).toEqual(["g-played~6: no single clear improvement"]);
  });

  it("drops mistakes before ply 8 unless they are opening trouble", async () => {
    const early = gameFromSans("g-early", ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
    const { out, skipped, evaluator } = await build([early], [finding("g-early", 6, "allowed-mate")]);
    expect(out).toEqual([]);
    expect(evaluator.calls).toEqual([]);
    expect(skipped).toEqual(["g-early~6: too early in the game"]);
  });

  it("uses each position once, from the most recent game", async () => {
    const again = gameFromSans("g-again", ["e4", "e5", "Nf3", "Nc6", "Ng1", "Nb8", "Bc4", "Nc6", "Qh5", "Nf6"]);
    expect(positionKey(again.moves[9]!.fenAfter)).toBe(positionKey(SCHOLAR));
    const { out, skipped } = await build(
      [scholar, again],
      [finding("g-scholar", 10, "allowed-mate"), finding("g-again", 10, "allowed-mate")],
      { playedAt: { "g-scholar": "2026-01-01T10:00:00Z", "g-again": "2026-01-02T10:00:00Z" } },
    );
    expect(out.map((c) => c.id)).toEqual(["g-again~10~punish"]);
    expect(skipped).toEqual(["g-scholar~10: same position already chosen"]);
  });

  it("takes at most two from a game, the costliest first", async () => {
    const g = seededGame("g-long", 3, 16);
    const findings = [10, 12, 14].map((ply, i) => finding("g-long", ply, "hung-piece", 10 + i));
    const { out } = await build([g], findings);
    expect(out.map((c) => c.ply)).toEqual([14, 12]);
    expect(MAX_PER_GAME).toBe(2);
  });

  it("searches at most twelve positions a run, most recent first", async () => {
    const games = Array.from({ length: 15 }, (_, i) => seededGame(`g${String(i).padStart(2, "0")}`, i + 1, 10));
    const findings = games.map((g) => finding(g.gameId, 9, "hung-piece"));
    const playedAt = Object.fromEntries(games.map((g, i) => [g.gameId, `2026-03-${String(i + 1).padStart(2, "0")}T12:00:00Z`]));
    const { out, evaluator } = await build(games, findings, { playedAt });
    expect(evaluator.calls).toHaveLength(MAX_PER_RUN);
    expect(out.map((c) => c.gameId)).toEqual(games.slice(3).reverse().map((g) => g.gameId));
  });

  it("never overlaps calls on one evaluator, and spreads them over several in a fixed order", async () => {
    const games = Array.from({ length: 8 }, (_, i) => seededGame(`c${i}`, i + 20, 10));
    const findings = games.map((g, i) => finding(g.gameId, 9, "hung-piece", 10 + i));
    const one = await build(games, findings);
    expect(one.evaluator.maxInFlight).toBe(1);
    const pool = [stubEvaluator(), stubEvaluator(), stubEvaluator(), stubEvaluator(), stubEvaluator()];
    const many = await buildPuzzleCandidates({ games, findings, evaluator: pool, concurrency: 3 });
    expect(pool.filter((e) => e.calls.length > 0)).toHaveLength(3);
    for (const e of pool) expect(e.maxInFlight).toBeLessThanOrEqual(1);
    expect(many).toEqual(one.out);
  });

  it("refuses an evaluator that cannot search several lines", async () => {
    const plain: Evaluator = { name: "plain", evaluate: async () => ({ score: { cp: 0 }, depth: 1 }) };
    await expect(buildPuzzleCandidates({ games: [scholar], findings: [], evaluator: plain })).rejects.toBeInstanceOf(
      MultiPvUnsupportedError,
    );
  });

  it("skips findings for games or plies it was not given, and unknown patterns", () => {
    const positions = puzzlePositions(
      [scholar],
      [finding("missing", 10, "hung-piece"), finding("g-scholar", 99, "hung-piece"), finding("g-scholar", 10, "time-trouble"), finding("g-scholar", 10, "new-thing")],
    );
    expect(positions).toEqual([]);
    expect(selectPositions([])).toEqual([]);
  });
});
