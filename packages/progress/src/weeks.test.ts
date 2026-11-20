import { describe, expect, it } from "vitest";
import { REPORT_WEEKS } from "./rules";
import { weekBuckets } from "./weeks";

const END = "2026-11-19T00:00:00Z";

/** Whether `playedAt` falls in the bucket: open on the old side, closed on the new side. */
const inBucket = (playedAt: string, b: { start: string; end: string }) =>
  Date.parse(playedAt) > Date.parse(b.start) && Date.parse(playedAt) <= Date.parse(b.end);

describe("weekBuckets", () => {
  it("returns the report weeks, newest first", () => {
    const weeks = weekBuckets(END);
    expect(weeks).toHaveLength(REPORT_WEEKS);
    expect(weeks[0]).toEqual({ start: "2026-11-12T00:00:00.000Z", end: "2026-11-19T00:00:00.000Z" });
    expect(weeks[5]).toEqual({ start: "2026-10-08T00:00:00.000Z", end: "2026-10-15T00:00:00.000Z" });
  });

  it("week 1 is (2026-11-05, 2026-11-12]", () => {
    expect(weekBuckets(END)[1]).toEqual({ start: "2026-11-05T00:00:00.000Z", end: "2026-11-12T00:00:00.000Z" });
  });

  it("honours count", () => {
    expect(weekBuckets(END, 2)).toHaveLength(2);
    expect(weekBuckets(END, 0)).toEqual([]);
  });

  it("is half-open on the old side: a boundary instant belongs to the newer week only", () => {
    const [w0, w1] = weekBuckets(END);
    const boundary = "2026-11-12T00:00:00.000Z";
    expect(inBucket(boundary, w0!)).toBe(false);
    expect(inBucket(boundary, w1!)).toBe(true);
    expect(inBucket(END, w0!)).toBe(true);
    expect(inBucket("2026-11-12T00:00:00.001Z", w0!)).toBe(true);
  });

  it("consecutive weeks meet without gaps", () => {
    const weeks = weekBuckets(END);
    for (let a = 1; a < weeks.length; a++) expect(weeks[a]!.end).toBe(weeks[a - 1]!.start);
  });

  it("rejects a bad date", () => {
    expect(() => weekBuckets("not a date")).toThrow();
  });
});
