/** Escapes text for HTML element content and for quoted attribute values, SVG included. */
export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only plain web links become `href`s; anything else is shown as text or not at all. */
export function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "one" to "ten", digits above that. */
export const numberWord = (n: number): string => WORDS[n] ?? String(n);

/** The same, with a capital first letter. */
export const NumberWord = (n: number): string => {
  const w = numberWord(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The UTC day of an ISO instant as day, month and year. */
function parts(iso: string): { d: number; m: string; y: number } | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return undefined;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? { d: Number(m[3]), m: month, y: Number(m[1]) } : undefined;
}

/** "16 Nov". */
export function dayMonth(iso: string): string {
  const p = parts(iso);
  return p ? `${p.d} ${p.m}` : iso.slice(0, 10);
}

/**
 * Two UTC days as a span: "17 Oct to 16 Nov 2026", "9 to 16 Nov 2026", "28 Dec 2026 to 4 Jan
 * 2027"; `year: false` leaves the final year off.
 */
export function daySpan(startIso: string, endIso: string, year = true): string {
  const a = parts(startIso);
  const b = parts(endIso);
  if (!a || !b) return `${startIso.slice(0, 10)} to ${endIso.slice(0, 10)}`;
  const end = `${b.d} ${b.m}${year ? ` ${b.y}` : ""}`;
  if (a.y !== b.y) return `${a.d} ${a.m} ${a.y} to ${end}`;
  if (a.m === b.m) return `${a.d} to ${end}`;
  return `${a.d} ${a.m} to ${end}`;
}
