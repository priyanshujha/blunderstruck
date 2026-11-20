import type { AnalyzedGame, GameRecord, PatternFinding, PatternSummary } from "@blunderstruck/contracts";

/** Plain-language names for pattern ids, as a player would say them. */
export const PATTERN_NAMES: Record<string, string> = {
  "missed-mate": "Missed a mate",
  "allowed-mate": "Walked into a mate",
  "hung-piece": "Left a piece hanging",
  "allowed-tactic": "Allowed a tactic",
  "missed-capture": "Missed a winning capture",
  "missed-tactic": "Missed a winning tactic",
  "thrown-win": "Let a winning position slip",
  "time-trouble": "Mistakes when short of time",
  "opening-trouble": "Same opening mistake again",
};

export const NOTHING_ELIGIBLE = "No habit repeated in two or more games yet.";

export const patternName = (id: string): string => PATTERN_NAMES[id] ?? id;

/** What the formatter knows about one game: the record for its link, the analysis for move and FEN. */
export interface GameInfo {
  record?: Pick<GameRecord, "url" | "platform">;
  analysis?: Pick<AnalyzedGame, "moves">;
}
export type GameLookup = (gameId: string) => GameInfo | undefined;

export interface FormatOptions {
  /** Example positions per habit, at most the two the summary carries. Default 2. */
  examples?: number;
  /** Also print the full per-pattern table and the repeated openings. */
  all?: boolean;
}

const f1 = (n: number): string => n.toFixed(1);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function moveLabelAt(info: GameInfo | undefined, ply: number): { label: string; fen?: string } {
  const m = info?.analysis?.moves.find((x) => x.ply === ply);
  const n = Math.ceil(ply / 2);
  const dots = ply % 2 === 1 ? "." : "...";
  return m ? { label: `${n}${dots}${m.san}`, fen: m.fenBefore } : { label: `${n}${dots} (ply ${ply})` };
}

function gameLink(info: GameInfo | undefined, ply: number, gameId: string): string {
  const r = info?.record;
  if (!r) return gameId;
  // Lichess opens the game at a ply given as the URL fragment.
  return r.platform === "lichess" ? `${r.url}#${ply}` : r.url;
}

function exampleLines(f: PatternFinding, lookup: GameLookup): string[] {
  const info = lookup(f.gameId);
  const { label, fen } = moveLabelAt(info, f.ply);
  const lines = [`   - ${label}  ${gameLink(info, f.ply, f.gameId)}`];
  if (fen) lines.push(`     FEN ${fen}`);
  const why = [f.evidence, f.motif ? `motif: ${f.motif}` : undefined].filter(Boolean).join("; ");
  lines.push(`     ${why ? `${why} ` : ""}(-${f1(f.winPctLoss)} win%)`);
  return lines;
}

function header(s: PatternSummary): string {
  return (
    `${s.player}: ${plural(s.games, "game")}, ${plural(s.moves, "move")}, ` +
    `${f1(s.mistakesPer100Moves)} mistakes per 100 moves` +
    (s.engine.name ? ` (${s.engine.name}, depth ${s.engine.depth})` : "")
  );
}

function table(s: PatternSummary): string[] {
  const rows = s.stats.map((st) => [
    patternName(st.patternId),
    f1(st.per100Moves),
    String(st.occurrences),
    `${st.gamesAffected}/${st.games}`,
    f1(st.avgWinPctLoss),
  ]);
  const head = ["Pattern", "Per 100 moves", "Count", "Games", "Avg win% lost"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const fmt = (r: string[]): string =>
    r.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join("  ").trimEnd();
  return [fmt(head), ...rows.map(fmt)];
}

function openings(s: PatternSummary): string[] {
  if (s.openings.length === 0) return [`No opening mistake repeated in these ${plural(s.games, "game")}.`];
  const out: string[] = [];
  for (const o of s.openings) {
    const name = [o.eco, o.name].filter(Boolean).join(" ");
    const line = o.line.length > 0 ? o.line.join(" ") : "(start position)";
    out.push(`- ${line}${name ? `  [${name}]` : ""}, as ${o.color}`);
    out.push(
      `  went wrong in ${o.games} of ${plural(o.reached, "game")} reaching it; played ${o.movesPlayed.join(", ")}` +
        `${o.bestMove ? `, best ${o.bestMove}` : ""}; avg -${f1(o.avgWinPctLoss)} win%`,
    );
  }
  return out;
}

/** The human-readable report: the leading habits first, the full detail only with `all`. */
export function formatPatterns(s: PatternSummary, lookup: GameLookup, opts: FormatOptions = {}): string {
  const examples = Math.max(0, Math.min(opts.examples ?? 2, 2));
  const out = [header(s), ""];
  if (s.top.length === 0) {
    out.push(NOTHING_ELIGIBLE);
  } else {
    out.push(s.top.length === 1 ? "Top habit" : `Top ${s.top.length} habits`);
    s.top.forEach((h, i) => {
      out.push(`${i + 1}. ${patternName(h.patternId)} (${h.patternId})`);
      out.push(
        `   costs ${f1(h.costPer100Moves)} win% per 100 moves, in ${h.gamesAffected} of ${plural(s.games, "game")}`,
      );
      for (const ex of h.examples.slice(0, examples)) out.push(...exampleLines(ex, lookup));
    });
  }
  if (opts.all) {
    out.push("", "All patterns", ...table(s), "", "Repeated opening mistakes", ...openings(s));
  }
  return out.join("\n");
}
