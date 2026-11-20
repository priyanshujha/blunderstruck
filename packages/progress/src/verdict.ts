import type { PatternStat, ProgressVerdict } from "@blunderstruck/contracts";
import {
  ALPHA,
  MIN_EXPECTED_EVENTS,
  MIN_RELATIVE_CHANGE,
  MIN_VERDICT_GAMES,
  MIN_VERDICT_MOVES,
} from "./rules";

/**
 * Compare a pattern's rate in the period before with the current one, using an exact
 * conditional binomial test. `pValue` is null when there is not enough data.
 */
export function verdict(
  previous: PatternStat,
  current: PatternStat,
): { verdict: ProgressVerdict; pValue: number | null } {
  const { games: gP, moves: nP, occurrences: kP } = previous;
  const { games: gC, moves: nC, occurrences: kC } = current;
  const insufficient = { verdict: "insufficient-data" as const, pValue: null };

  if (gP < MIN_VERDICT_GAMES || gC < MIN_VERDICT_GAMES) return insufficient;
  if (nP < MIN_VERDICT_MOVES || nC < MIN_VERDICT_MOVES) return insufficient;

  const total = kP + kC;
  const share = nC / (nP + nC);
  if (total * share < MIN_EXPECTED_EVENTS) return insufficient;

  const rateP = kP / nP;
  const rateC = kC / nC;
  const lower = binomialTail(kC, total, share, "le");
  const upper = binomialTail(kC, total, share, "ge");

  if (lower <= ALPHA && rateC <= rateP * (1 - MIN_RELATIVE_CHANGE)) {
    return { verdict: "improved", pValue: lower };
  }
  if (upper <= ALPHA && rateC >= rateP * (1 + MIN_RELATIVE_CHANGE)) {
    return { verdict: "worse", pValue: upper };
  }
  return { verdict: "flat", pValue: Math.min(lower, upper) };
}

/** Tail of `Binomial(n, p)`: `P(X <= k)` for side "le", `P(X >= k)` for side "ge". */
export function binomialTail(k: number, n: number, p: number, side: "le" | "ge"): number {
  const from = side === "le" ? 0 : Math.max(0, Math.ceil(k));
  const to = side === "le" ? Math.min(n, Math.floor(k)) : n;
  if (from > to) return 0;

  // Log-space pmf terms, summed with log-sum-exp so large n neither overflows nor underflows.
  // A running maximum rescales the sum whenever a larger term appears, so no array is built.
  let max = -Infinity;
  let sum = 0;
  for (let x = from; x <= to; x++) {
    const term = logPmf(x, n, p);
    if (term === -Infinity) continue;
    if (term > max) {
      sum = sum * Math.exp(max - term) + 1;
      max = term;
    } else {
      sum += Math.exp(term - max);
    }
  }
  if (max === -Infinity) return 0;
  return Math.min(1, Math.max(0, Math.exp(max) * sum));
}

function logPmf(x: number, n: number, p: number): number {
  if (p <= 0) return x === 0 ? 0 : -Infinity;
  if (p >= 1) return x === n ? 0 : -Infinity;
  return logChoose(n, x) + x * Math.log(p) + (n - x) * Math.log1p(-p);
}

function logChoose(n: number, x: number): number {
  return logFactorial(n) - logFactorial(x) - logFactorial(n - x);
}

const logFactorials: number[] = [0];

function logFactorial(n: number): number {
  for (let i = logFactorials.length; i <= n; i++) {
    logFactorials.push(logFactorials[i - 1]! + Math.log(i));
  }
  return logFactorials[n]!;
}
