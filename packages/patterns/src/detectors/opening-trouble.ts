import type { AnalyzedMove } from "@blunderstruck/contracts";
import { moveLabel, positionKey, uciToSan } from "../board";
import { playerMoves } from "../game";
import { isCountable, OPENING_MAX_PLY, OPENING_MIN_GAMES } from "../rules";
import type { DetectorHit, PlayerGame, SetDetector } from "../types";

interface Occurrence {
  game: PlayerGame;
  move: AnalyzedMove;
}

/** "1.e4 e5 2.Nf3" for the moves before `ply`; "the start position" when there are none. */
function lineBefore(g: PlayerGame, ply: number): string {
  const parts = g.analysis.moves
    .filter((m) => m.ply < ply)
    .map((m) => (m.color === "white" ? `${Math.ceil(m.ply / 2)}.${m.san}` : m.san));
  const first = g.analysis.moves[0];
  // A game starting with Black to move: write "1...e5", not a bare "e5".
  if (first && first.color === "black" && first.ply < ply) parts[0] = moveLabel(first);
  return parts.length === 0 ? "the start position" : parts.join(" ");
}

/**
 * `opening-trouble`: a countable move at or before `OPENING_MAX_PLY` whose position (the
 * first four FEN fields, so transpositions meet) was a countable mistake by the player, same
 * colour, in at least `OPENING_MIN_GAMES` different games of the set. One finding per game
 * per position, at the earliest ply that game was there; `subject` is the position key.
 * Hits come back sorted by game id, ply and position, whatever order the games are given in.
 */
export const openingTrouble: SetDetector = {
  id: "opening-trouble",
  scope: "set",
  family: "context",
  detect(games) {
    // colour + position -> game id -> the first countable mistake there in that game.
    const groups = new Map<string, Map<string, Occurrence>>();
    for (const game of games) {
      for (const move of playerMoves(game)) {
        if (move.ply > OPENING_MAX_PLY || !isCountable(move)) continue;
        const group = `${game.color}|${positionKey(move.fenBefore)}`;
        const byGame = groups.get(group) ?? new Map<string, Occurrence>();
        const seen = byGame.get(game.analysis.gameId);
        if (!seen || move.ply < seen.move.ply) byGame.set(game.analysis.gameId, { game, move });
        groups.set(group, byGame);
      }
    }

    const hits: DetectorHit[] = [];
    for (const byGame of groups.values()) {
      const n = byGame.size;
      if (n < OPENING_MIN_GAMES) continue;
      for (const [gameId, { game, move }] of byGame) {
        const best = move.bestUci ? `; engine prefers ${uciToSan(move.fenBefore, move.bestUci)}` : "";
        hits.push({
          gameId,
          ply: move.ply,
          winPctLoss: move.winPctLoss,
          evidence: `after ${lineBefore(game, move.ply)}: played ${move.san} (mistake here in ${n} games)${best}`,
          subject: positionKey(move.fenBefore),
        });
      }
    }
    return hits.sort(
      (a, b) =>
        (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0) ||
        a.ply - b.ply ||
        (a.subject! < b.subject! ? -1 : a.subject! > b.subject! ? 1 : 0),
    );
  },
};
