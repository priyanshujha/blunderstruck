import {
  ANALYSIS_VERSION,
  JUDGMENT_THRESHOLDS,
  type OpeningStat,
  PATTERN_IDS,
  PATTERNS_VERSION,
  type PatternFinding,
  type PatternStat,
  type PatternSummary,
  type TopHabit,
} from "@blunderstruck/contracts";
import { positionKey, uciToSan } from "./board";
import { DETECTORS } from "./detectors";
import { findPatterns } from "./find";
import { moveAt, playerMoves } from "./game";
import { TOP_MAX, TOP_MIN_GAMES, TOP_MIN_OCCURRENCES } from "./rules";
import type { Detector, PlayerGame } from "./types";

const EPSILON = 1e-9;
const plyKey = (f: Pick<PatternFinding, "gameId" | "ply">): string => `${f.gameId}#${f.ply}`;
/** Order-independent sum: the same values always add up in the same (ascending) order. */
const sum = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b).reduce((s, x) => s + x, 0);
/** Code-unit string order, the same on every machine and locale. */
const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : sum(xs) / xs.length);
const idRank = (id: string): number => {
  const i = (PATTERN_IDS as readonly string[]).indexOf(id);
  return i === -1 ? PATTERN_IDS.length : i;
};

/**
 * One `PatternStat` per id in `PATTERN_IDS`, zeros included. `games` and `moves` are the size
 * of the whole set; `per100Moves` and `avgWinPctLoss` are 0 when there is nothing to divide by.
 */
export function patternStats(games: number, moves: number, findings: readonly PatternFinding[]): PatternStat[] {
  return PATTERN_IDS.map((patternId) => {
    const xs = findings.filter((f) => f.patternId === patternId);
    return {
      patternId,
      games,
      moves,
      gamesAffected: new Set(xs.map((f) => f.gameId)).size,
      occurrences: xs.length,
      per100Moves: moves === 0 ? 0 : (100 * xs.length) / moves,
      avgWinPctLoss: mean(xs.map((f) => f.winPctLoss)),
    };
  });
}

/**
 * Up to two examples: the largest loss first, then the largest from another game if there is
 * one. When findings carry a `subject` (e.g. the position of an `opening-trouble`), the second
 * must be about a different subject, preferably in another game; with one subject only, one
 * example, since a second would show the same thing again.
 */
function pickExamples(xs: readonly PatternFinding[]): PatternFinding[] {
  const sorted = [...xs].sort((a, b) => b.winPctLoss - a.winPctLoss || byString(a.gameId, b.gameId) || a.ply - b.ply);
  const first = sorted[0];
  if (!first) return [];
  const pool = first.subject === undefined ? sorted.slice(1) : sorted.filter((f) => f.subject !== first.subject);
  const second = pool.find((f) => f.gameId !== first.gameId) ?? pool[0];
  return second ? [first, second] : [first];
}

/**
 * The player's leading habits, at most `TOP_MAX`, chosen greedily. Each round picks the
 * pattern whose findings on moves no earlier pick covers cost the most win%: the sum of their
 * `winPctLoss` x 100 / `moves`. A pattern is eligible only with at least `TOP_MIN_OCCURRENCES`
 * such findings in at least `TOP_MIN_GAMES` games. Ties go to more games affected, then more
 * occurrences, then `PATTERN_IDS` order. Because a move covered once is never paid for again,
 * a situation pattern (thrown-win, time-trouble, opening-trouble) only gets in for win% the
 * habits above it do not already explain. `stats` names the candidate patterns.
 */
export function rankTop(
  stats: readonly PatternStat[],
  findings: readonly PatternFinding[],
  moves: number,
): TopHabit[] {
  if (moves <= 0) return [];
  const covered = new Set<string>();
  const chosen = new Set<string>();
  const top: TopHabit[] = [];
  const candidates = [...new Set(stats.map((s) => s.patternId))];

  while (top.length < TOP_MAX) {
    let best: { id: string; cost: number; games: number; xs: PatternFinding[] } | undefined;
    for (const id of candidates) {
      if (chosen.has(id)) continue;
      const xs = findings.filter((f) => f.patternId === id && !covered.has(plyKey(f)));
      const games = new Set(xs.map((f) => f.gameId)).size;
      if (xs.length < TOP_MIN_OCCURRENCES || games < TOP_MIN_GAMES) continue;
      const cost = (sum(xs.map((f) => f.winPctLoss)) * 100) / moves;
      const better =
        !best ||
        cost > best.cost + EPSILON ||
        (Math.abs(cost - best.cost) <= EPSILON &&
          (games > best.games ||
            (games === best.games &&
              (xs.length > best.xs.length || (xs.length === best.xs.length && idRank(id) < idRank(best.id))))));
      if (better) best = { id, cost, games, xs };
    }
    if (!best) break;
    chosen.add(best.id);
    for (const f of best.xs) covered.add(plyKey(f));
    top.push({
      patternId: best.id,
      costPer100Moves: best.cost,
      gamesAffected: best.games,
      examples: pickExamples(best.xs),
    });
  }
  return top;
}

/**
 * Groups `opening-trouble` findings by position (`subject` holds the position key) into one
 * `OpeningStat` each. `reached` counts the games in `games` where the player faced the
 * position at all. Representative fields (line, eco, name, best move) come from the first game
 * by id, and `gameIds` are in id order. Most games first, then the larger average loss, then
 * the first game id: the result does not depend on the order of `games` or `findings`.
 */
export function openingStats(games: readonly PlayerGame[], findings: readonly PatternFinding[]): OpeningStat[] {
  const byId = new Map(games.map((g) => [g.analysis.gameId, g] as const));
  const groups = new Map<string, PatternFinding[]>();
  // Game id, then ply: each group's first finding is from its first game by id.
  const ordered = [...findings].sort((a, b) => byString(a.gameId, b.gameId) || a.ply - b.ply);
  for (const f of ordered) {
    if (f.patternId !== "opening-trouble" || f.subject === undefined || !byId.has(f.gameId)) continue;
    const list = groups.get(f.subject) ?? [];
    if (!list.some((x) => x.gameId === f.gameId)) list.push(f);
    groups.set(f.subject, list);
  }

  const out: OpeningStat[] = [];
  for (const [key, list] of groups) {
    const first = list[0]!;
    const g0 = byId.get(first.gameId)!;
    const m0 = moveAt(g0, first.ply);
    const reached = games.filter((g) => playerMoves(g).some((m) => positionKey(m.fenBefore) === key)).length;
    out.push({
      positionKey: key,
      color: g0.color,
      line: g0.analysis.moves.filter((m) => m.ply < first.ply).map((m) => m.san),
      ...(g0.opening?.eco ? { eco: g0.opening.eco } : {}),
      ...(g0.opening?.name ? { name: g0.opening.name } : {}),
      games: list.length,
      reached,
      movesPlayed: list.map((f) => moveAt(byId.get(f.gameId)!, f.ply)?.san ?? "?"),
      ...(m0?.bestUci ? { bestMove: uciToSan(m0.fenBefore, m0.bestUci) } : {}),
      avgWinPctLoss: mean(list.map((f) => f.winPctLoss)),
      gameIds: list.map((f) => f.gameId),
    });
  }
  return out.sort(
    (a, b) =>
      b.games - a.games ||
      b.avgWinPctLoss - a.avgWinPctLoss ||
      byString(a.gameIds[0]!, b.gameIds[0]!) ||
      byString(a.positionKey, b.positionKey),
  );
}

/**
 * Everything the patterns say about one player's set of games: per-pattern stats (every
 * pattern, zeros included), the findings, repeated opening positions and the top habits.
 * Throws when the games mix analysis versions, engines or depths, or are not from the current
 * `ANALYSIS_VERSION`. An empty set gives zeros everywhere and engine `{ name: "", depth: 0 }`.
 * Games are taken in game-id order, so any permutation of `games` gives the same summary.
 */
export function summarize(
  player: string,
  input: readonly PlayerGame[],
  detectors: readonly Detector[] = DETECTORS,
): PatternSummary {
  // Sorted by game id, so the summary (findings order, set detectors, sums) is the same for any
  // order of the input. Array.prototype.sort is stable for equal ids.
  const games = [...input].sort((a, b) => byString(a.analysis.gameId, b.analysis.gameId));
  const first = games[0]?.analysis;
  for (const g of games) {
    const a = g.analysis;
    if (a.analysisVersion !== ANALYSIS_VERSION) {
      throw new Error(`${a.gameId}: analysis version ${a.analysisVersion}, expected ${ANALYSIS_VERSION}`);
    }
    if (a.engine.depth !== first!.engine.depth || a.engine.name !== first!.engine.name) {
      throw new Error(
        `cannot compare analyses from different engines or depths: ${first!.gameId} is ${first!.engine.name} depth ${first!.engine.depth}, ${a.gameId} is ${a.engine.name} depth ${a.engine.depth}`,
      );
    }
  }

  const own = games.flatMap((g) => playerMoves(g));
  const moves = own.length;
  const mistakes = own.filter((m) => m.winPctLoss >= JUDGMENT_THRESHOLDS.mistake).length;
  const findings = findPatterns(games, detectors);
  const stats = patternStats(games.length, moves, findings);

  return {
    player,
    patternsVersion: PATTERNS_VERSION,
    analysisVersion: ANALYSIS_VERSION,
    engine: first ? { ...first.engine } : { name: "", depth: 0 },
    games: games.length,
    moves,
    mistakesPer100Moves: moves === 0 ? 0 : (100 * mistakes) / moves,
    stats,
    findings,
    openings: openingStats(games, findings),
    top: rankTop(stats, findings, moves),
  };
}
