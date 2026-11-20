import {
  isEligible,
  PATTERN_IDS,
  type PatternFinding,
  type PatternPriority,
  type PatternSummary,
  type RatingBand,
} from "@blunderstruck/contracts";
import {
  CHRONICITY_WEIGHT,
  HALF_LIFE_WEEKS,
  MIN_COUNTED_WEEKS,
  MIN_WEEK_GAMES,
  PRIOR_MOVES,
  REFERENCE_RATES,
  REPORT_WEEKS,
  SEVERITY_PRIOR,
  SEVERITY_PRIOR_WEIGHT,
  TOP_MIN_GAMES,
  TOP_MIN_OCCURRENCES,
} from "./rules";

/** One report week of the player's games: moves played and the findings in them. */
export type WeekFindings = {
  start: string;
  end: string;
  games: number;
  moves: number;
  findings: readonly PatternFinding[];
};

export interface PrioritiesInput {
  /** The report weeks, newest first. */
  weeks: readonly WeekFindings[];
  /** The current period, for its naive cost. */
  current: PatternSummary;
  band: RatingBand;
  /** Pattern ids that may not be chosen now (cooling down after graduating or rotating). */
  cooldown: ReadonlySet<string>;
}

const EPSILON = 1e-9;
/** A finding covers the player's move it is on, as in `rankTop`. */
const plyKey = (f: Pick<PatternFinding, "gameId" | "ply">): string => `${f.gameId}#${f.ply}`;
/** Order-independent sum: the same values always add up in the same (ascending) order. */
const sum = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b).reduce((s, x) => s + x, 0);
/** Recency weight of week `a` (0 is the newest). */
const weight = (a: number): number => 2 ** (-a / HALF_LIFE_WEEKS);
const idRank = (id: string): number => (PATTERN_IDS as readonly string[]).indexOf(id);

/** A pattern scored on the findings no earlier pick covers. */
type Scored = Omit<PatternPriority, "eligible" | "rank" | "naiveCostThisPeriod"> & {
  /** Weighted uncovered findings, for ties. */
  k: number;
  /** The uncovered findings the score was computed from. */
  used: PatternFinding[];
};

function score(patternId: string, weeks: readonly (WeekFindings | undefined)[], covered: ReadonlySet<string>): Scored {
  const mu = REFERENCE_RATES[patternId as keyof typeof REFERENCE_RATES];
  let n = 0;
  let k = 0;
  let loss = 0;
  let recurredWeight = 0;
  let countedWeight = 0;
  let weeksRecurred = 0;
  let weeksCounted = 0;
  const flags: (boolean | null)[] = [];
  const used: PatternFinding[] = [];

  for (let a = 0; a < REPORT_WEEKS; a++) {
    const week = weeks[a];
    const w = weight(a);
    const xs = (week?.findings ?? []).filter((f) => f.patternId === patternId && !covered.has(plyKey(f)));
    used.push(...xs);
    n += w * (week?.moves ?? 0);
    k += w * xs.length;
    loss += w * sum(xs.map((f) => f.winPctLoss));

    if (!week || week.games < MIN_WEEK_GAMES) {
      flags.push(null);
      continue;
    }
    const recurred = xs.length >= TOP_MIN_OCCURRENCES && new Set(xs.map((f) => f.gameId)).size >= TOP_MIN_GAMES;
    flags.push(recurred);
    weeksCounted++;
    countedWeight += w;
    if (recurred) {
      weeksRecurred++;
      recurredWeight += w;
    }
  }

  const rate = (100 * ((mu * PRIOR_MOVES) / 100 + k)) / (PRIOR_MOVES + n);
  const severity = (SEVERITY_PRIOR_WEIGHT * SEVERITY_PRIOR + loss) / (SEVERITY_PRIOR_WEIGHT + k);
  // `rate` is per 100 moves and `severity` is win% per finding, so their product is already
  // win% lost per 100 moves.
  const recentCost = rate * severity;
  const chronicity = weeksCounted < MIN_COUNTED_WEEKS ? 0 : recurredWeight / countedWeight;
  return {
    patternId,
    rate,
    severity,
    recentCost,
    chronicity,
    score: recentCost * (1 + CHRONICITY_WEIGHT * chronicity),
    persistence: { weeksRecurred, weeksCounted, weeks: flags, chronicity },
    k,
    used,
  };
}

/** True when `a` beats `b`: higher score, then more weeks recurred, more weighted findings, `PATTERN_IDS` order. */
function beats(a: Scored, b: Scored): boolean {
  if (Math.abs(a.score - b.score) > EPSILON) return a.score > b.score;
  if (a.persistence.weeksRecurred !== b.persistence.weeksRecurred) {
    return a.persistence.weeksRecurred > b.persistence.weeksRecurred;
  }
  if (Math.abs(a.k - b.k) > EPSILON) return a.k > b.k;
  return idRank(a.patternId) < idRank(b.patternId);
}

/**
 * Score every pattern by recent cost and persistence, greedily over findings not yet covered.
 *
 * A pattern is eligible when its band allows it, the current period holds at least
 * `TOP_MIN_OCCURRENCES` of its findings in at least `TOP_MIN_GAMES` games, and it is not in
 * `cooldown`. Each round scores every remaining eligible pattern on the findings, over all
 * weeks, on moves (`gameId#ply`) no earlier pick covers. As in `rankTop`, a pattern stays
 * rankable only while its uncovered current-period findings still meet that floor; the best
 * rankable pattern is ranked next and its moves become covered. `eligible: true` with
 * `rank: null` means higher picks already cover too much of the pattern this period; it keeps
 * the numbers of the last round it was scored in. Ineligible patterns keep their round-one
 * numbers and `rank: null`. The result lists ranked patterns by rank, then the rest in
 * `PATTERN_IDS` order.
 */
export function priorities(input: PrioritiesInput): PatternPriority[] {
  const { weeks, current, band, cooldown } = input;
  if (weeks.length > REPORT_WEEKS) {
    throw new Error(`expected at most ${REPORT_WEEKS} weeks, got ${weeks.length}`);
  }

  const naive = new Map<string, number>();
  const eligible = new Set<string>();
  for (const patternId of PATTERN_IDS) {
    const stat = current.stats.find((s) => s.patternId === patternId);
    const occurrences = stat?.occurrences ?? 0;
    const moves = stat?.moves ?? current.moves;
    naive.set(patternId, moves === 0 ? 0 : (occurrences * (stat?.avgWinPctLoss ?? 0) * 100) / moves);
    const floor = occurrences >= TOP_MIN_OCCURRENCES && (stat?.gamesAffected ?? 0) >= TOP_MIN_GAMES;
    if (floor && isEligible(band, patternId) && !cooldown.has(patternId)) eligible.add(patternId);
  }

  const finish = (s: Scored, rank: number | null): PatternPriority => ({
    patternId: s.patternId,
    eligible: eligible.has(s.patternId),
    rank,
    rate: s.rate,
    severity: s.severity,
    recentCost: s.recentCost,
    naiveCostThisPeriod: naive.get(s.patternId) ?? 0,
    chronicity: s.chronicity,
    score: s.score,
    persistence: s.persistence,
  });

  const covered = new Set<string>();
  const ranked: PatternPriority[] = [];
  const dropped = new Map<string, PatternPriority>();
  const remaining: string[] = PATTERN_IDS.filter((id) => eligible.has(id));
  /** This period's floor, on findings no earlier pick covers. */
  const passesFloor = (id: string): boolean => {
    const xs = current.findings.filter((f) => f.patternId === id && !covered.has(plyKey(f)));
    return xs.length >= TOP_MIN_OCCURRENCES && new Set(xs.map((f) => f.gameId)).size >= TOP_MIN_GAMES;
  };
  while (remaining.length > 0) {
    let best: Scored | undefined;
    for (const id of [...remaining]) {
      const s = score(id, weeks, covered);
      if (!passesFloor(id)) {
        dropped.set(id, finish(s, null));
        remaining.splice(remaining.indexOf(id), 1);
        continue;
      }
      if (!best || beats(s, best)) best = s;
    }
    if (!best) break;
    remaining.splice(remaining.indexOf(best.patternId), 1);
    for (const f of best.used) covered.add(plyKey(f));
    for (const f of current.findings) if (f.patternId === best.patternId) covered.add(plyKey(f));
    ranked.push(finish(best, ranked.length + 1));
  }

  const rest = PATTERN_IDS.filter((id) => !ranked.some((p) => p.patternId === id)).map(
    (id) => dropped.get(id) ?? finish(score(id, weeks, new Set()), null),
  );
  return [...ranked, ...rest];
}
