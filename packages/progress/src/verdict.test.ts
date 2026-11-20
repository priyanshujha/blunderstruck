import type { PatternStat } from "@blunderstruck/contracts";
import { describe, expect, it } from "vitest";
import { binomialTail, verdict } from "./verdict";

const stat = (occurrences: number, moves: number, games = 30): PatternStat => ({
  patternId: "hung-piece",
  games,
  moves,
  gamesAffected: Math.min(games, occurrences),
  occurrences,
  per100Moves: moves === 0 ? 0 : (100 * occurrences) / moves,
  avgWinPctLoss: 20,
});

const previous = stat(52, 4000);

describe("verdict", () => {
  it.each([
    [6, "improved", 0.04],
    [7, "flat", 0.075],
    [9, "flat", 0.196],
    [22, "worse", 0.03],
    [19, "flat", 0.104],
  ] as const)("kC = %i against 52 in 4000 moves is %s with p = %f", (kC, expected, p) => {
    const result = verdict(previous, stat(kC, 1000));
    expect(result.verdict).toBe(expected);
    expect(result.pValue).not.toBeNull();
    expect(result.pValue!).toBeCloseTo(p, 3);
  });

  it("is insufficient-data when too few events are expected (E = 1.40)", () => {
    expect(verdict(stat(6, 4000), stat(1, 1000))).toEqual({ verdict: "insufficient-data", pValue: null });
  });

  it("is insufficient-data with fewer than 10 current games", () => {
    expect(verdict(previous, stat(6, 1000, 8))).toEqual({ verdict: "insufficient-data", pValue: null });
  });

  it("is insufficient-data with fewer than 10 previous games", () => {
    expect(verdict(stat(52, 4000, 9), stat(6, 1000))).toEqual({ verdict: "insufficient-data", pValue: null });
  });

  it("is insufficient-data with fewer than 300 current moves", () => {
    expect(verdict(previous, stat(6, 299))).toEqual({ verdict: "insufficient-data", pValue: null });
  });

  it("is insufficient-data with fewer than 300 previous moves", () => {
    expect(verdict(stat(52, 299), stat(6, 1000))).toEqual({ verdict: "insufficient-data", pValue: null });
  });

  it("is flat, not improved, when significant but the rate fell by less than 20%", () => {
    // A 10% drop: with this many events it is significant, but too small to count.
    const result = verdict(stat(40_000, 400_000), stat(9_000, 100_000));
    expect(result.verdict).toBe("flat");
    expect(result.pValue!).toBeLessThan(0.05);
  });
});

describe("binomialTail", () => {
  it("sums to 1 for n = 0", () => {
    expect(binomialTail(0, 0, 0.2, "le")).toBe(1);
    expect(binomialTail(0, 0, 0.2, "ge")).toBe(1);
  });

  it("matches a small exact case", () => {
    // Binomial(3, 0.5): P(X <= 1) = 4/8, P(X >= 2) = 4/8, P(X >= 3) = 1/8.
    expect(binomialTail(1, 3, 0.5, "le")).toBeCloseTo(0.5, 12);
    expect(binomialTail(2, 3, 0.5, "ge")).toBeCloseTo(0.5, 12);
    expect(binomialTail(3, 3, 0.5, "ge")).toBeCloseTo(0.125, 12);
  });

  it("covers everything at the edges and nothing beyond them", () => {
    expect(binomialTail(10, 10, 0.3, "le")).toBeCloseTo(1, 12);
    expect(binomialTail(0, 10, 0.3, "ge")).toBeCloseTo(1, 12);
    expect(binomialTail(11, 10, 0.3, "ge")).toBe(0);
    expect(binomialTail(-1, 10, 0.3, "le")).toBe(0);
  });

  it("stays finite for large n", () => {
    const p = binomialTail(1_900, 10_000, 0.2, "le");
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.01);
  });
});
