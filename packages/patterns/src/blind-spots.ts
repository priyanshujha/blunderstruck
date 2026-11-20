import {
  BLIND_SPOT_IDS,
  BLIND_SPOTS,
  type BlindSpot,
  type BlindSpotFamily,
  blindSpotFamilyOf,
  type BlindSpotId,
  type BlindSpotWindow,
  type PatternFinding,
} from "@blunderstruck/contracts";
import { moveAt, playerMoves } from "./game";
import {
  BLIND_SPOT_MAX,
  BLIND_SPOT_MIN_COUNT,
  BLIND_SPOT_MIN_GAMES,
  BLIND_SPOT_MIN_LIFT,
  BLIND_SPOT_MIN_SHARE,
  BLIND_SPOT_REFINEMENT_MIN,
  BLIND_SPOT_REFINEMENT_MIN_SHARE,
  isCountable,
} from "./rules";
import { traitsOf } from "./traits";
import type { PlayerGame } from "./types";

export { phaseTrait, traitsOf } from "./traits";

/*
 * Blind spots: properties (traits.ts) much more common among one pattern's occurrences than
 * among all of the player's mistakes.
 *
 * - The pattern's numbers: `count` of its `of` occurrences in the window have the property,
 *   spread over `games` games. Every occurrence counts, including the few that are not
 *   countable mistakes (`missed-mate` does not use the countable rule).
 * - The baseline: `baselineCount` of `baselineOf`, over every countable mistake of the player
 *   (`isCountable`) in the window's games, the pattern's own countable occurrences included.
 *   An occurrence that is not a countable mistake is in the pattern's numbers but not in the
 *   baseline, so `baselineCount >= count` does not always hold.
 * - Selected, all in integers: `count >= BLIND_SPOT_MIN_COUNT`, `games >= BLIND_SPOT_MIN_GAMES`,
 *   share `den * count >= num * of`, and lift `den * count * baselineOf >= num * baselineCount * of`
 *   (a baseline count of 0 passes). Child properties are never selected on their own.
 * - Order: more `count`, then more `games`, then `BLIND_SPOT_IDS` order; at most `BLIND_SPOT_MAX`.
 * - A selected parent gets at most one child as `refinement`: the child holding for the most of
 *   its occurrences (then `BLIND_SPOT_IDS` order), when that is at least
 *   `BLIND_SPOT_REFINEMENT_MIN` and at least `BLIND_SPOT_REFINEMENT_MIN_SHARE` of the parent's.
 * - Examples: the occurrence with the property with the largest `winPctLoss`, then the largest
 *   in another game (ties by game id, then ply).
 * The result does not depend on the order of `games` or `findings`.
 */

/** One move with its traits, as the selection reads it. */
export interface TraitedMove {
  gameId: string;
  ply: number;
  /** The win% the move cost, for choosing examples. */
  winPctLoss: number;
  traits: ReadonlySet<BlindSpotId>;
}

export interface BlindSpotResult {
  spots: BlindSpot[];
  window: BlindSpotWindow;
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const idRank = (id: BlindSpotId): number => BLIND_SPOT_IDS.indexOf(id);
const atLeast = (part: number, whole: number, share: { num: number; den: number }): boolean =>
  share.den * part >= share.num * whole;

function pickExamples(xs: readonly TraitedMove[]): BlindSpot["examples"] {
  const sorted = [...xs].sort((a, b) => b.winPctLoss - a.winPctLoss || byString(a.gameId, b.gameId) || a.ply - b.ply);
  const first = sorted[0];
  if (!first) return [];
  const second = sorted.find((x) => x.gameId !== first.gameId);
  return [first, ...(second ? [second] : [])].map((x) => ({ gameId: x.gameId, ply: x.ply }));
}

/**
 * The selection rule over moves whose traits are already read: `occurrences` are the
 * pattern's, `baseline` the player's countable mistakes in the same games. Pure and
 * order-independent.
 */
export function chooseBlindSpots(
  occurrences: readonly TraitedMove[],
  baseline: readonly TraitedMove[],
  family: BlindSpotFamily,
): BlindSpot[] {
  const of = occurrences.length;
  const baselineOf = baseline.length;
  const candidates: (BlindSpot & { rank: number })[] = [];
  for (const info of BLIND_SPOTS) {
    if (info.parent || (info.family !== family && info.family !== "both")) continue;
    const xs = occurrences.filter((o) => o.traits.has(info.id));
    const count = xs.length;
    const games = new Set(xs.map((x) => x.gameId)).size;
    const baselineCount = baseline.filter((b) => b.traits.has(info.id)).length;
    if (count < BLIND_SPOT_MIN_COUNT || games < BLIND_SPOT_MIN_GAMES) continue;
    if (!atLeast(count, of, BLIND_SPOT_MIN_SHARE)) continue;
    if (BLIND_SPOT_MIN_LIFT.den * count * baselineOf < BLIND_SPOT_MIN_LIFT.num * baselineCount * of) continue;

    let refinement: BlindSpot["refinement"];
    for (const child of BLIND_SPOTS) {
      if (child.parent !== info.id) continue;
      const c = xs.filter((x) => x.traits.has(child.id)).length;
      if (c < BLIND_SPOT_REFINEMENT_MIN || !atLeast(c, count, BLIND_SPOT_REFINEMENT_MIN_SHARE)) continue;
      if (!refinement || c > refinement.count) refinement = { id: child.id, count: c };
    }
    candidates.push({
      rank: idRank(info.id),
      id: info.id,
      basis: info.basis,
      count,
      games,
      of,
      baselineCount,
      baselineOf,
      ...(refinement ? { refinement } : {}),
      examples: pickExamples(xs),
    });
  }
  return candidates
    .sort((a, b) => b.count - a.count || b.games - a.games || a.rank - b.rank)
    .slice(0, BLIND_SPOT_MAX)
    .map(({ rank: _rank, ...spot }) => spot);
}

/**
 * The blind spots of `patternId` over the window: `games` (the player's analysed games in it)
 * and `findings` (theirs; others are ignored). `period` is the window's start and end, carried
 * into `window`. Patterns outside the two blind-spot families get no spots; `window` still
 * counts the games and the player's countable mistakes.
 */
export function blindSpots(
  games: readonly PlayerGame[],
  findings: readonly PatternFinding[],
  patternId: string,
  period: { start: string; end: string },
): BlindSpotResult {
  const byId = new Map<string, PlayerGame>();
  for (const g of games) if (!byId.has(g.analysis.gameId)) byId.set(g.analysis.gameId, g);
  const ordered = [...byId.values()].sort((a, b) => byString(a.analysis.gameId, b.analysis.gameId));
  const mistakes = ordered.flatMap((g) => playerMoves(g).filter(isCountable).map((m) => ({ g, m })));
  const window: BlindSpotWindow = { start: period.start, end: period.end, games: ordered.length, mistakes: mistakes.length };

  const family = blindSpotFamilyOf(patternId);
  if (!family) return { spots: [], window };

  const seen = new Set<string>();
  const occurrences: TraitedMove[] = [];
  const mine = findings
    .filter((f) => f.patternId === patternId && byId.has(f.gameId))
    .sort((a, b) => byString(a.gameId, b.gameId) || a.ply - b.ply || b.winPctLoss - a.winPctLoss);
  for (const f of mine) {
    const key = `${f.gameId}#${f.ply}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const g = byId.get(f.gameId)!;
    const m = moveAt(g, f.ply);
    if (!m || m.color !== g.color) continue;
    occurrences.push({ gameId: f.gameId, ply: f.ply, winPctLoss: f.winPctLoss, traits: new Set(traitsOf(g, m, family)) });
  }
  const baseline: TraitedMove[] = mistakes.map(({ g, m }) => ({
    gameId: g.analysis.gameId,
    ply: m.ply,
    winPctLoss: m.winPctLoss,
    traits: new Set(traitsOf(g, m, family)),
  }));
  return { spots: chooseBlindSpots(occurrences, baseline, family), window };
}
