import { describe, expect, it } from "vitest";
import {
  BAND_RUBRIC,
  PATTERN_IDS,
  RATING_POOL_OFFSETS,
  RatingBand,
  bandFromRatings,
  isEligible,
  medianRating,
  toBandScale,
} from "./index";

describe("band rubric", () => {
  it("names only known patterns, with advice for every band", () => {
    for (const band of RatingBand.options) {
      const { eligible, adviceLevel } = BAND_RUBRIC[band];
      expect(eligible.length).toBeGreaterThan(0);
      for (const id of eligible) expect(PATTERN_IDS).toContain(id);
      expect(new Set(eligible).size).toBe(eligible.length);
      expect(adviceLevel.length).toBeGreaterThan(0);
    }
  });

  it("stages the patterns by band", () => {
    expect(BAND_RUBRIC.novice.eligible).toHaveLength(5);
    expect(BAND_RUBRIC.beginner.eligible).toHaveLength(8);
    expect(BAND_RUBRIC.club.eligible).toEqual(PATTERN_IDS);
    expect(BAND_RUBRIC.advanced.eligible).toHaveLength(7);
    expect(BAND_RUBRIC.expert.eligible).toHaveLength(5);
    for (const id of BAND_RUBRIC.novice.eligible) expect(BAND_RUBRIC.beginner.eligible).toContain(id);
  });

  it("answers eligibility per band", () => {
    expect(isEligible("club", "hung-piece")).toBe(true);
    expect(isEligible("advanced", "hung-piece")).toBe(false);
    expect(isEligible("novice", "opening-trouble")).toBe(false);
    expect(isEligible("expert", "time-trouble")).toBe(true);
    expect(isEligible("club", "some-future-pattern")).toBe(false);
  });
});

describe("rating pools", () => {
  it("moves a rating onto the band scale by its pool's offset", () => {
    expect(RATING_POOL_OFFSETS.chesscom.rapid).toBe(0);
    expect(toBandScale("chesscom", "rapid", 1200)).toBe(1200);
    expect(toBandScale("chesscom", "blitz", 1000)).toBe(1200);
    expect(toBandScale("chesscom", "bullet", 900)).toBe(1200);
    expect(toBandScale("lichess", "rapid", 1500)).toBe(1200);
    expect(toBandScale("lichess", "classical", 1550)).toBe(1200);
  });

  it("takes the median, averaging the two middle ratings", () => {
    expect(medianRating([1100, 1300])).toBe(1200);
    expect(medianRating([1300, 900, 1100])).toBe(1100);
    expect(medianRating([1000, 1001])).toBe(1001);
    expect(medianRating([])).toBeNull();
  });

  it("bands the median of a period's ratings", () => {
    expect(bandFromRatings("chesscom", "rapid", [1100, 1300])).toBe("club");
    expect(bandFromRatings("lichess", "rapid", [1100, 1300])).toBe("beginner");
    expect(bandFromRatings("lichess", "bullet", [])).toBeNull();
  });
});
