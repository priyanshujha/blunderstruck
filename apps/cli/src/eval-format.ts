import type { Score } from "@blunderstruck/contracts";
import { type EvalResult, winPct } from "@blunderstruck/engine";
import { lineToSan, uciToSan } from "@blunderstruck/patterns";

/** How many plies of each line `eval --lines` prints. */
export const PV_HEAD_PLIES = 6;

function scoreText(score: Score): string {
  if ("mate" in score) return `mate ${score.mate}`;
  return score.cp > 0 ? `+${score.cp}` : `${score.cp}`;
}

/**
 * One row per line, best first: rank, move (UCI and SAN), score and win chance for the side
 * to move, and the start of the line in SAN.
 */
export function formatEvalLines(engine: string, fen: string, results: readonly EvalResult[]): string {
  const side = fen.split(" ")[1] === "b" ? "black" : "white";
  const depth = Math.max(0, ...results.map((r) => r.depth));
  const out = [`${engine}, depth ${depth}; scores and win% are for ${side} (to move)`];
  const rows = results.map((r, i) => [
    `${i + 1}`,
    r.bestMove ?? "-",
    r.bestMove ? uciToSan(fen, r.bestMove) : "-",
    scoreText(r.score),
    `${winPct(r.score).toFixed(1)}%`,
    lineToSan(fen, (r.pv ?? []).slice(0, PV_HEAD_PLIES)).join(" "),
  ]);
  const widths = [0, 1, 2, 3, 4].map((c) => Math.max(...rows.map((row) => row[c]!.length)));
  for (const row of rows) {
    const cells = row.map((cell, c) => (c === 0 || c === 3 || c === 4 ? cell.padStart(widths[c] ?? 0) : cell.padEnd(widths[c] ?? 0)));
    out.push(cells.join("  ").trimEnd());
  }
  return out.join("\n");
}
