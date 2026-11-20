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
