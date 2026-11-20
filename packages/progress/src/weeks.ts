import { REPORT_WEEKS, WEEK_DAYS } from "./rules";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The report weeks ending at `end`, newest first. Week `a` is the interval
 * `(end - 7(a+1) days, end - 7a days]`: open on the old side, closed on the new side.
 * `count` defaults to the number of report weeks.
 */
export function weekBuckets(end: string, count: number = REPORT_WEEKS): { start: string; end: string }[] {
  const endMs = Date.parse(end);
  if (Number.isNaN(endMs)) throw new Error(`weekBuckets: not a date: ${end}`);
  const weekMs = WEEK_DAYS * DAY_MS;
  const buckets: { start: string; end: string }[] = [];
  for (let a = 0; a < count; a++) {
    buckets.push({
      start: new Date(endMs - (a + 1) * weekMs).toISOString(),
      end: new Date(endMs - a * weekMs).toISOString(),
    });
  }
  return buckets;
}
