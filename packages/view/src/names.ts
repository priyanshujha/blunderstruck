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

export const patternName = (id: string): string => PATTERN_NAMES[id] ?? id;

/**
 * What each blind-spot property means, as a club player would say it, following the trait
 * definitions in the patterns package. "They" is the opponent, "the winning move" is the move
 * the player missed, "the piece you lost" is a knight, bishop, rook or queen (never a pawn).
 * Motif properties say "looked like", as they are read by rule of thumb.
 */
export const BLIND_SPOT_LABELS: Record<string, string> = {
  "answer-check": "Their reply gave check",
  "answer-knight-check": "Their reply was a check from the knight that moved",
  "answer-fork": "Their reply looked like a fork",
  "answer-discovered": "Their reply looked like a discovered attack",
  "moved-piece-lost": "The piece you had just moved was the one you lost",
  "moved-onto-attacked": "The piece you lost had just moved onto a square they already attacked",
  "moved-after-capture": "The piece you lost had just made a capture",
  "left-after-attack": "The piece you lost had not moved, and their last move attacked it",
  undefended: "Right after your move, nothing of yours defended the piece you lost",
  "lost-knight": "The piece you lost was a knight",
  "lost-bishop": "The piece you lost was a bishop",
  "lost-rook": "The piece you lost was a rook",
  "lost-queen": "The piece you lost was your queen",
  "best-check": "The winning move was a check",
  "best-knight": "The winning move was a check from the knight that moved",
  "best-capture": "The winning move was a capture",
  "best-quiet": "The winning move was a quiet one: no check, capture or promotion",
  "takes-last-moved": "The winning line took the piece they had moved last",
  "best-fork": "The winning move looked like a fork",
  "best-discovered": "The winning move looked like a discovered attack",
  "moves-1-10": "It happened in the first 10 moves",
  "moves-11-20": "It happened between moves 11 and 20",
  "moves-21-30": "It happened between moves 21 and 30",
  "moves-31-plus": "It happened after move 30",
};

/** How a child property narrows its parent, after "9 of them": "9 of them from the knight that moved". */
export const REFINEMENT_PHRASES: Record<string, string> = {
  "answer-knight-check": "from the knight that moved",
  "moved-onto-attacked": "after it moved onto a square they already attacked",
  "moved-after-capture": "right after it made a capture",
  "best-knight": "from the knight that moved",
};

/** A blind spot's label; an id this version does not know is shown as it is. */
export const blindSpotLabel = (id: string): string => BLIND_SPOT_LABELS[id] ?? id;
