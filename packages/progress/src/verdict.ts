import type { PatternStat, ProgressVerdict } from "@blunderstruck/contracts";

/**
 * Compare a pattern's rate in the period before with the current one, using an exact
 * conditional binomial test. `pValue` is null when there is not enough data.
 */
export function verdict(
  previous: PatternStat,
  current: PatternStat,
): { verdict: ProgressVerdict; pValue: number | null } {
  throw new Error("not implemented");
}

/** Tail of `Binomial(n, p)`: `P(X <= k)` for side "le", `P(X >= k)` for side "ge". */
export function binomialTail(k: number, n: number, p: number, side: "le" | "ge"): number {
  throw new Error("not implemented");
}
