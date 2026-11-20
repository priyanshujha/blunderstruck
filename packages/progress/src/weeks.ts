/**
 * The report weeks ending at `end`, newest first. Week `a` is the interval
 * `(end - 7(a+1) days, end - 7a days]`: open on the old side, closed on the new side.
 * `count` defaults to the number of report weeks.
 */
export function weekBuckets(end: string, count?: number): { start: string; end: string }[] {
  throw new Error("not implemented");
}
