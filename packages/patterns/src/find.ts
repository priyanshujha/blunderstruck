import { JUDGMENT_THRESHOLDS, PATTERN_IDS, type PatternFinding, type PatternId } from "@blunderstruck/contracts";
import { DETECTORS } from "./detectors";
import type { Detector, DetectorFamily, DetectorHit, PlayerGame } from "./types";

interface TaggedHit extends DetectorHit {
  patternId: PatternId;
  family: DetectorFamily;
}

const rank = (id: PatternId): number => PATTERN_IDS.indexOf(id);

function toFinding(h: TaggedHit): PatternFinding {
  return {
    patternId: h.patternId,
    gameId: h.gameId,
    ply: h.ply,
    winPctLoss: h.winPctLoss,
    evidence: h.evidence,
    ...(h.motif ? { motif: h.motif } : {}),
    ...(h.subject !== undefined ? { subject: h.subject } : {}),
  };
}

/** Detectors whose `subject` is the player's own best move, as a `bestUci` string. */
const BEST_MOVE_SUBJECT: ReadonlySet<PatternId> = new Set<PatternId>(["missed-mate", "missed-capture", "missed-tactic"]);

/**
 * The player's own moves strictly between two of their plies keep a streak about `subject`
 * alive when each lost less than the mistake threshold. For `missed-mate`, `missed-capture` and
 * `missed-tactic` only, whose `subject` is the player's best move (its `bestUci`), a move in
 * between whose `bestUci` equals the subject also keeps it: the same missed move again, left
 * unlabelled only because a detector's gate failed on that move, e.g. the played move won some
 * material back. Every other detector gets only the threshold, including `allowed-tactic`,
 * whose subject is a UCI move too but the opponent's, so a matching `bestUci` string would be
 * a coincidence.
 */
function streakHolds(g: PlayerGame, patternId: PatternId, fromPly: number, toPly: number, subject: string): boolean {
  const moves = g.analysis.moves;
  const first = moves[0]?.ply ?? 0;
  const bestMoveSubject = BEST_MOVE_SUBJECT.has(patternId);
  for (let ply = fromPly + 2; ply < toPly; ply += 2) {
    const m = moves[ply - first];
    if (!m || m.ply !== ply) return false;
    if (m.winPctLoss >= JUDGMENT_THRESHOLDS.mistake && !(bestMoveSubject && m.bestUci === subject)) return false;
  }
  return true;
}

/**
 * Runs the detectors over a player's games and applies the counting rules:
 * - **Exclusivity:** among "tactical" detectors, at most one finding per move; the earliest in
 *   `PATTERN_IDS` wins. "context" findings may share a move with anything.
 * - **One count per streak:** a hit from the same detector with the same `subject` as that
 *   detector's previous claimed hit in the game continues it, and is not counted again, when
 *   every one of the player's own moves in between lost less than the mistake threshold
 *   (`JUDGMENT_THRESHOLDS.mistake`) or, for the detectors whose subject is the player's best
 *   move, had the subject as its best move (see `streakHolds`). A clean move in between (say a
 *   forced recapture that was the engine's choice) leaves the same thing on the board, so it is
 *   still the same occurrence; any other mistake in between, labelled or not, ends the streak, so the subject
 *   recurring after it counts again. A move missing from the analysis also ends it. A
 *   continuation still claims its move, so a lower-ranked tactical label cannot count it
 *   instead. Hits without a `subject` always count.
 * Findings come back in game order (as given), then ply, then `PATTERN_IDS` order.
 */
export function findPatterns(
  games: readonly PlayerGame[],
  detectors: readonly Detector[] = DETECTORS,
): PatternFinding[] {
  const hits: TaggedHit[] = [];
  for (const d of detectors) {
    const tag = (h: DetectorHit): TaggedHit => ({ ...h, patternId: d.id, family: d.family });
    if (d.scope === "set") hits.push(...d.detect(games).map(tag));
    else for (const g of games) hits.push(...d.detect(g).map(tag));
  }

  const byGame = new Map<string, TaggedHit[]>();
  for (const h of hits) {
    const list = byGame.get(h.gameId);
    if (list) list.push(h);
    else byGame.set(h.gameId, [h]);
  }

  const out: PatternFinding[] = [];
  const seenGames = new Set<string>();
  for (const g of games) {
    const gameId = g.analysis.gameId;
    if (seenGames.has(gameId)) continue;
    seenGames.add(gameId);
    const list = (byGame.get(gameId) ?? []).sort((a, b) => a.ply - b.ply || rank(a.patternId) - rank(b.patternId));

    const lastClaim = new Map<PatternId, { ply: number; subject?: string }>();
    const claim = (h: TaggedHit): void => {
      const last = lastClaim.get(h.patternId);
      const continues =
        h.subject !== undefined && last !== undefined && last.subject === h.subject && streakHolds(g, h.patternId, last.ply, h.ply, h.subject);
      lastClaim.set(h.patternId, { ply: h.ply, subject: h.subject });
      if (!continues) out.push(toFinding(h));
    };

    let i = 0;
    while (i < list.length) {
      const ply = list[i]!.ply;
      const atPly: TaggedHit[] = [];
      while (i < list.length && list[i]!.ply === ply) atPly.push(list[i++]!);
      const done = new Set<PatternId>();
      let tacticalTaken = false;
      for (const h of atPly) {
        if (done.has(h.patternId)) continue; // a detector counts once per move
        done.add(h.patternId);
        if (h.family === "tactical") {
          if (tacticalTaken) continue;
          tacticalTaken = true;
        }
        claim(h);
      }
    }
  }
  return out;
}
