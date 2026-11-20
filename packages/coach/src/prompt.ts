import {
  BAND_RUBRIC,
  BLIND_SPOT_IDS,
  type BlindSpot,
  type BlindSpotId,
  blindSpotTokenValues,
  type BetterReason,
  type ExampleStory,
  type FocusExample,
  focusTokenValues,
  type MoveDetail,
  PATTERN_IDS,
  type PatternId,
  RATING_BANDS,
  type ReportDraft,
  type StoryPiece,
  SUMMARY_TOKENS,
  summaryTokenValues,
} from "@blunderstruck/contracts";
import { STEP_TOKENS, WORDING_FOCUS_TOKENS, WORDING_SUMMARY_TOKENS } from "./validate";

/** The shape of the model's answer. No `maxItems`, `minimum`, `maxLength` or `oneOf`: limits are checked after parsing. */
export const WORDING_SCHEMA: object = {
  type: "object",
  properties: {
    summary: { type: "string" },
    focus: {
      type: "array",
      items: {
        type: "object",
        properties: {
          patternId: { type: "string" },
          title: { type: "string" },
          why: { type: "string" },
          drill: { type: "string" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: { blindSpot: { type: "string" }, text: { type: "string" } },
              required: ["blindSpot", "text"],
              additionalProperties: false,
            },
          },
        },
        required: ["patternId", "title", "why", "drill", "steps"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "focus"],
  additionalProperties: false,
};

/** One line per pattern id: what the engine counted. */
const GLOSSARY: Record<PatternId, string> = {
  "missed-mate":
    "the player had checkmate in two moves or fewer and played a move that let it go (counted even when they stayed winning).",
  "allowed-mate": "the player's move let the opponent force checkmate in two moves or fewer.",
  "hung-piece":
    "the player's move left a knight, bishop, rook or queen where the opponent could win it outright, and the opponent took it or could have.",
  "allowed-tactic":
    "the player's move allowed a tactic (often a fork or a discovered attack) that wins at least two pawns' worth of material or mates.",
  "missed-capture": "the player could have won at least two pawns' worth of material with a capture and played something else.",
  "missed-tactic":
    "the player had a tactic winning at least two pawns' worth of material (or mate) and did not play it.",
  "thrown-win": "the player reached a clearly winning position, then a move of theirs gave most of it back, and they did not win.",
  "time-trouble": "a mistake made with very little time left on the clock (the threshold scales with the time control).",
  "opening-trouble":
    "the same early position (by move twelve) went wrong for the player, with the same colour, in two or more different games.",
};

const FOCUS_TOKEN_MEANING: Record<(typeof WORDING_FOCUS_TOKENS)[number], string> = {
  games: "games in this period",
  gamesAffected: "games in this period with at least one of this mistake",
  occurrences: "times this mistake happened in this period",
};

const SUMMARY_TOKEN_MEANING: Record<(typeof SUMMARY_TOKENS)[number], string> = {
  games: "games in this period",
  mistakeRate: "mistakes of any kind per hundred of the player's moves",
  mistakesPerGame: "mistakes of any kind per game, with one decimal",
  focusCount: "number of focus items",
};

const STEP_TOKEN_MEANING: Record<(typeof STEP_TOKENS)[number], string> = {
  count: "this blind spot's occurrences",
  of: "the pattern's occurrences in the same games",
  games: "games those occurrences are in (in a step, {games} means these games, not the period's)",
};

/** What each blind spot means, in plain words, for the prompt. */
export const BLIND_SPOT_MEANING: Record<BlindSpotId, string> = {
  "answer-check": "the opponent's punishing move was a check",
  "answer-knight-check": "the punishing move was a check by the knight that moved",
  "answer-fork": "the punishing move looked like a fork: the piece that moved attacked two targets and won one of them",
  "answer-discovered": "the punishing move looked like a discovered attack: a piece stepped aside and uncovered an attack behind it",
  "moved-piece-lost": "the piece the player had just moved was the one lost",
  "moved-onto-attacked": "the player moved that piece onto a square the opponent already attacked",
  "moved-after-capture": "the player's move was a capture, and the capturing piece was lost",
  "left-after-attack": "the piece lost had not moved: the opponent's previous move attacked it, and the player left it there",
  undefended: "right after the player's move, nothing defended the piece that was then lost",
  "lost-knight": "the piece lost was a knight",
  "lost-bishop": "the piece lost was a bishop",
  "lost-rook": "the piece lost was a rook",
  "lost-queen": "the piece lost was the queen",
  "best-check": "the winning move the player missed was a check",
  "best-knight": "the winning move missed was a check by the knight that moved",
  "best-capture": "the winning move missed was a capture",
  "best-quiet": "the winning move missed was a quiet move: no check, no capture and no promotion",
  "takes-last-moved": "the winning line missed captured the piece the opponent had just moved",
  "best-fork": "the winning move missed looked like a fork",
  "best-discovered": "the winning move missed looked like a discovered attack",
  "moves-1-10": "it happened in moves 1 to 10",
  "moves-11-20": "it happened in moves 11 to 20",
  "moves-21-30": "it happened in moves 21 to 30",
  "moves-31-plus": "it happened from move 31 on",
};

const meaningOf = (id: string) => (BLIND_SPOT_MEANING as Record<string, string>)[id] ?? id;

/** A worked example of a good answer. It passes `parseWording` for the input `EXAMPLE_INPUT` describes. */
const EXAMPLE = {
  summary:
    "Over {games} games you made {mistakesPerGame} mistakes a game. The habits below did most of the damage, and they are very fixable.",
  focus: [
    {
      patternId: "allowed-tactic",
      title: "Checks you did not see coming",
      why: "The shot that hurt was usually a check, and this one keeps coming back. In the first example Qd2 walked into Ne4+, a knight check that also hit the queen: the queen had just moved there and nothing guarded it.",
      drill:
        "Before you let go of a piece, play the opponent for a moment: what are their checks, captures and attacks now? A short set of defensive puzzles each day, where you spot the threat first.",
      steps: [
        {
          blindSpot: "answer-check",
          text: "Before every move, list each check your opponent will have after it, knight checks first, and make sure none of them also hits one of your pieces.",
        },
        {
          blindSpot: "moved-piece-lost",
          text: "Before you let go of a piece, look at the square it lands on and count who attacks it and who defends it once it is there.",
        },
      ],
    },
    {
      patternId: "missed-tactic",
      title: "Forks that went unplayed",
      why: "The winning move you passed over was usually a check. In the second example Ne4+ forked king and queen and won the queen; h6 looked safe and let it go.",
      drill:
        "Look at every check, capture and threat before choosing a move, even when the position feels calm. Solve 10 fork puzzles a day, each one two moves deep.",
      steps: [
        {
          blindSpot: "best-check",
          text: "On every move, look at each check you can give before anything else, even the ones that look silly, and follow each one a move deeper.",
        },
      ],
    },
  ],
};

/** The input the worked example answers, shortened. */
const EXAMPLE_INPUT = [
  "- allowed-tactic, blind spots answer-check then moved-piece-lost. Example: played Qd2 (your queen d1-d2); punishing line Ne4+ (their knight f6-e4, check) Ke1 Nxd2 (takes your queen) Kxd2; hits your king f2 and your queen d2; better Re1, which covers e4.",
  "- missed-tactic, blind spot best-check. Example: played h6 (your pawn h7-h6); better Ne4+ (your knight f6-e4, check) Ke1 Nxd2 (takes their queen) Kxd2, which wins their queen for your knight.",
].join("\n");

function bandLines(): string {
  return RATING_BANDS.map((b, i) => {
    const prev = i === 0 ? undefined : RATING_BANDS[i - 1]!.maxRating;
    const range = prev === undefined ? `up to ${b.maxRating}` : Number.isFinite(b.maxRating) ? `${prev + 1} to ${b.maxRating}` : `${prev + 1} and above`;
    const rubric = BAND_RUBRIC[b.id];
    return `- ${b.id} (${range} on a rapid-like scale). Advice level: ${rubric.adviceLevel} Patterns that can be focus items: ${rubric.eligible.join(", ")}.`;
  }).join("\n");
}

/** Built once: nothing in it depends on the player, so every call sends the same bytes first. */
const SYSTEM = [
  "You write the words of a chess improvement report. Code has already analysed the player's games with an engine, counted their recurring mistakes, and chosen at most two things for them to work on. Your job is to explain those choices and give one practical drill for each, in plain English.",
  "",
  "# Voice",
  "Write like a friend who plays: dry, kind, a little self-deprecating. Humour is welcome, but the joke is always on the blunder, never on the player. No scolding, no hype, no exclamation marks in a row, no emoji. Speak to the player as \"you\". Keep it short and concrete; one good sentence beats three vague ones.",
  "",
  "# What you decide and what you do not",
  "- The focus items, their order and their reasons are fixed. Do not add, drop, merge, reorder or rename them, and do not suggest that a different pattern matters more.",
  "- Each focus item comes with why code chose it: kind \"new\" (chosen for the first time), \"kept\" (still on the list from earlier reports), \"rose\" (it climbed into the top picks), \"returned\" (worked on before, now back). Score, recentCost and severity are win-percentage points; chronicity is how steadily it came back. Use these to choose what to stress, never to quote.",
  "- Each focus item comes with up to two examples from the player's games, each with its story, computed by the engine: the move played, the punishing line (the opponent's best answer, move by move), the pieces it hit, the piece lost, the better line and why it was better, plus a short fact. An example without a story is given as a FEN position instead, with the move played and the engine's best move. Do not invent positions, moves or facts that are not given.",
  "- The page shows each example's moves as sentences and boards of its own, so do not retell the lines; naming one move to make a point is plenty.",
  "- opponentFoundIt says whether the opponent actually played the punishing line in the game. When it is false they missed it, and the piece is given as couldHaveLost instead of lost: say what the move could have cost (\"it could have cost your queen\", \"you got away with it\"), never that the piece was lost.",
  "- Earlier focus items may come with a verdict: \"improved\", \"flat\" (no clear change), \"worse\" or \"insufficient-data\" (not enough games yet). Mention an improvement warmly in the summary. Do not call \"flat\" or \"insufficient-data\" a failure.",
  "- Directly under your text, the program prints for each focus item a frequency line (in how many of the player's games it happened, and roughly how often), its goal, and a line with how many recent weeks it came back in (only when at least three weeks were counted). Do not restate them: the why says what happened and why it matters, and the drill says what to do.",
  "- So do not open the why with how many games were affected, and do not restate that count anywhere: the frequency line already says it. Spend the why on what the examples and the blind spots show: the move that let it happen, what it cost, and the thing the occurrences had in common.",
  "- If you do write a count with gamesAffected despite that, read it first: when it is 1, write the singular (\"in a single game\"); when it equals games, say \"in each of your {games} games\".",
  "- You may mention persistence in words, without numbers (\"this one keeps coming back\"), only when the item's reason has weeksCounted of three or more and weeksRecurred is more than half of weeksCounted. Otherwise say nothing about how often it recurred.",
  "- Size each drill to the player's band using the rubric below. One drill per item: a habit or a short daily routine the player can actually do this week.",
  "",
  "# Patterns",
  "Each focus item has one of these pattern ids:",
  ...PATTERN_IDS.map((id) => `- ${id}: ${GLOSSARY[id]}`),
  "",
  "# Moves and squares",
  "In a focus item's title, why, drill and steps you may name the moves of that item's own examples: the move played, the moves of the punishing line, the moves of the better line, and moves named in an example's fact. You may name the squares of those moves and of the pieces in the stories (\"the queen on d2\"), and for an example given as a FEN, the squares of its pieces. Name no other move or square: no move of your own, no line you worked out, nothing from another item's examples. Write moves exactly as given (\"Ne4+\", \"Nxd2\").",
  "The summary is about the whole period: it names no move and no square.",
  "",
  "# Blind spots and steps",
  "Some focus items come with blind spots: something many of the pattern's occurrences had in common, much more often than among the player's mistakes overall. Each blind spot gives:",
  "- id and meaning: what the occurrences had in common;",
  "- tokens: its numbers, written only as step tokens;",
  "- overall: how common it is among all the player's mistakes in the same games, this pattern's included, so you can judge how unusual it is; never quote it;",
  "- refinement (sometimes): a narrower property that holds for many of them; mention it in words if it helps;",
  "- heuristic (sometimes): true when it was read from the shape of the position; then say \"looked like a fork\", not \"was a fork\".",
  "Examples list the blind spots they show as traits.",
  "For each blind spot write exactly one step, in the order the blind spots are given:",
  "- blindSpot: exactly its id;",
  "- text: at most 200 characters, one thing to do at the board during a game that would have caught this blind spot. A good step is specific (what to look at, and when), checkable (the player can tell afterwards whether they did it) and tied to its blind spot, not to the pattern in general. Study routines and puzzle sets belong in the drill, not in a step.",
  "Good step for \"the opponent's punishing move was a check\": \"Before every move, list each check your opponent will have after it, and make sure none of them also hits one of your pieces.\" Bad steps: \"Be more careful.\", \"Do more puzzles.\", \"Remember the example.\"",
  "An item with no blind spots gets \"steps\": []. Never write a step for a blind spot that is not given.",
  "",
  "# Rating bands",
  "The player's band decides how simple the advice must be and which patterns may be focus items:",
  bandLines(),
  "",
  "# Numbers are written as tokens",
  "Never write the player's numbers yourself. Write a token in braces and code fills in the number, because a wrong number in a report is worse than no number.",
  "How many games, times or weeks something happened to the player is written only with its token, never as a number of your own, in digits or in words. No percentages, fractions of their games or rates, in any field. Numbers that describe a position, a clock or what to practise are fine as they are: \"Nd5 forked two pieces\", \"with 1 second left\", \"solve 15 puzzles a day\", \"play 3+2 games this week\". The report prints the frequency, goal and weeks lines itself, and shows rates only in its details, so leave those out entirely. When an item's gamesAffected is 0 (a kept item that stayed away this period), say it stayed away and to keep the habit going; never write \"{gamesAffected} of\" or \"0 of\" for it.",
  "Tokens allowed in a focus item's title, why and drill:",
  ...WORDING_FOCUS_TOKENS.map((t) => `- {${t}}: ${FOCUS_TOKEN_MEANING[t]}`),
  "Tokens allowed in the summary:",
  ...WORDING_SUMMARY_TOKENS.map((t) => `- {${t}}: ${SUMMARY_TOKEN_MEANING[t]}`),
  "State the player's overall level with {mistakesPerGame} only (\"{mistakesPerGame} mistakes a game\"). Per-hundred-move figures are not written in the wording at all.",
  "Tokens allowed in a step, filled from its blind spot:",
  ...STEP_TOKENS.map((t) => `- {${t}}: ${STEP_TOKEN_MEANING[t]}`),
  "A step follows the same number rules as a drill, and most good steps need no number at all.",
  "Rules:",
  "- Use only the tokens listed for that field, spelled exactly, in single braces. No other braces anywhere.",
  "- Good, when a count is needed at all: \"you hung a piece {occurrences} times\", \"over {games} games\".",
  "- Bad: \"in 9 of 31 games\", \"9/31 games\", \"40%\", \"you hung a piece in nine games\", \"half of your games\", \"2 per 100 moves\", \"per hundred moves\" in any form.",
  "- Do not write how many items there are (\"two habits\", \"both\"); use {focusCount} in the summary if you need the number.",
  "",
  "# Output",
  "Answer with one JSON object and nothing else:",
  "- summary: two or three sentences on the period as a whole, at most 600 characters, using only the summary tokens.",
  "- focus: one entry per focus item you are asked to word, in the order given, each with:",
  "  - patternId: exactly the id given;",
  "  - title: a short headline, at most 60 characters;",
  "  - why: why this matters for this player, at most 400 characters;",
  "  - drill: one concrete drill sized to the band, at most 400 characters;",
  "  - steps: one step per blind spot of the item, in the order given (an empty array when it has none).",
  "Sometimes only some focus items are asked for, because the others already have their text; word only those, and still write the summary for the whole report.",
  "",
  "Example of a good answer for a club player whose focus items, shortened, were:",
  EXAMPLE_INPUT,
  "Its squares, moves and examples are illustrative only: never reuse them; refer only to the positions you are given.",
  "```json",
  JSON.stringify(EXAMPLE, null, 2),
  "```",
].join("\n");

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** The values of the tokens a new summary may use. */
function wordingSummaryTokenValues(draft: ReportDraft): Record<string, string> {
  const all = summaryTokenValues(draft);
  return Object.fromEntries(WORDING_SUMMARY_TOKENS.map((t) => [t, all[t]]));
}

/** The values of the tokens the wording may use; the printed lines' values are left out. */
function wordingTokenValues(f: ReportDraft["focus"][number], draft: ReportDraft): Record<string, string> {
  const all = focusTokenValues(f, draft);
  return Object.fromEntries(WORDING_FOCUS_TOKENS.map((t) => [t, all[t]]));
}

/** "Ne4+ (their knight f6-e4, takes your queen, check)", from the player's side. */
function moveWords(m: MoveDetail, player: MoveDetail["color"]): string {
  const own = m.color === player ? "your" : "their";
  const other = m.color === player ? "their" : "your";
  const parts = [
    m.castle ? `${own} king castles ${m.castle === "king" ? "short" : "long"}` : `${own} ${m.piece} ${m.from}-${m.to}`,
  ];
  if (m.captured) parts.push(`takes ${other} ${m.captured}${m.enPassant ? " en passant" : ""}`);
  if (m.promotion) parts.push(`promotes to a ${m.promotion}`);
  if (m.mate) parts.push("mate");
  else if (m.check) parts.push("check");
  return `${m.san} (${parts.join(", ")})`;
}

function pieceWords(p: StoryPiece, player: MoveDetail["color"]): string {
  return `${p.color === player ? "your" : "their"} ${p.piece} ${p.square}`;
}

/** Why the better move was better, in words, with the rule's kind. */
function reasonWords(r: BetterReason): { kind: BetterReason["kind"]; says: string } {
  switch (r.kind) {
    case "mates":
      return { kind: r.kind, says: r.mateIn ? `it mates in ${r.mateIn}` : "it mates" };
    case "wins":
      return { kind: r.kind, says: `it wins their ${r.piece ?? "material"}${r.gave ? ` for your ${r.gave}` : ""}` };
    case "covers-square":
      return { kind: r.kind, says: `it covers ${r.square ?? "the key square"}, so the punishing move no longer works there` };
    case "stops-key-move":
      return { kind: r.kind, says: "it makes the punishing move impossible" };
    case "holds":
      return { kind: r.kind, says: "it keeps the position without losing anything" };
  }
}

/** An example's story, compactly, in words and notation. */
function storyWords(st: ExampleStory): Record<string, unknown> {
  const me = st.played.color;
  const line = (ms: readonly MoveDetail[]) => ms.map((m) => moveWords(m, me)).join(", ");
  return {
    played: moveWords(st.played, me),
    ...(st.punish.length > 0 ? { punish: line(st.punish), opponentFoundIt: st.replyFound } : {}),
    ...(st.targets.length > 0 ? { hits: st.targets.map((p) => pieceWords(p, me)).join(", ") } : {}),
    ...(st.rear ? { behind: pieceWords(st.rear, me) } : {}),
    // When the opponent did not play the punishing line, nothing was lost in the game.
    ...(st.lost ? (st.replyFound ? { lost: pieceWords(st.lost, me) } : { couldHaveLost: pieceWords(st.lost, me) }) : {}),
    ...(st.better.length > 0 ? { better: line(st.better) } : {}),
    ...(st.betterReason ? { betterReason: reasonWords(st.betterReason) } : {}),
  };
}

/** One example for the prompt: its story when it has one, otherwise its position. */
function exampleData(e: FocusExample): Record<string, unknown> {
  return {
    ...(e.story ? storyWords(e.story) : { fen: e.fen, played: e.played, ...(e.best ? { best: e.best } : {}) }),
    ...(e.evidence ? { fact: e.evidence } : {}),
    ...(e.motif ? { motif: e.motif } : {}),
    ...(e.traits && e.traits.length > 0 ? { traits: e.traits } : {}),
    winPctLost: round(e.winPctLoss, 1),
  };
}

/**
 * How common a blind spot is among all the player's countable mistakes in the same games, the
 * pattern's own occurrences included: `baselineCount / baselineOf`, never a share of "other"
 * mistakes. "rare elsewhere" only when every mistake with the property is one of this pattern's.
 */
function overallShare(b: BlindSpot): string {
  if (b.baselineCount === b.count) return "rare elsewhere";
  if (b.baselineOf <= 0 || b.baselineCount <= 0) return "none of the mistakes overall";
  const n = Math.round(b.baselineOf / b.baselineCount);
  return n <= 1 ? "nearly all of the mistakes overall" : `about 1 in ${n} of the mistakes overall`;
}

function blindSpotData(b: BlindSpot): Record<string, unknown> {
  return {
    id: b.id,
    meaning: meaningOf(b.id),
    ...(b.basis === "motif" ? { heuristic: true } : {}),
    tokens: blindSpotTokenValues(b),
    overall: overallShare(b),
    ...(b.refinement ? { refinement: { id: b.refinement.id, meaning: meaningOf(b.refinement.id) } } : {}),
  };
}

/** Every blind-spot id has a meaning; checked once so a new id cannot slip through without one. */
for (const id of BLIND_SPOT_IDS) if (!BLIND_SPOT_MEANING[id]) throw new Error(`no meaning for blind spot ${id}`);

/**
 * The system prefix (the same for every player) and the user part (this player's numbers).
 * `only` limits the request to those pattern ids.
 */
export function buildPrompt(draft: ReportDraft, only?: string[]): { system: string; user: string } {
  const asked = draft.focus.filter((f) => !only || only.includes(f.patternId));
  const others = draft.focus.filter((f) => !asked.includes(f));
  const data = {
    band: draft.band,
    platform: draft.track.platform,
    timeClass: draft.track.timeClass,
    report: draft.kind === "first" ? "first report" : "weekly report",
    summaryTokens: wordingSummaryTokenValues(draft),
    focus: asked.map((f) => ({
      patternId: f.patternId,
      reason: {
        ...f.reason,
        score: round(f.reason.score),
        recentCost: round(f.reason.recentCost),
        naiveCostThisPeriod: round(f.reason.naiveCostThisPeriod),
        rate: round(f.reason.rate),
        severity: round(f.reason.severity),
        chronicity: round(f.reason.chronicity),
      },
      baselinePer100Moves: round(f.baseline.per100Moves),
      target: round(f.target),
      onListSince: f.since,
      tokens: wordingTokenValues(f, draft),
      blindSpots: (f.blindSpots ?? []).map(blindSpotData),
      examples: f.examples.map(exampleData),
    })),
    ...(others.length > 0 ? { alreadyWorded: others.map((f) => f.patternId) } : {}),
    earlierFocus: draft.progress.map((p) => ({
      patternId: p.patternId,
      verdict: p.verdict,
      before: round(p.previous.per100Moves),
      now: round(p.current.per100Moves),
    })),
    retired: draft.retired.map((r) => ({ patternId: r.patternId, why: r.why })),
  };
  const ids = asked.map((f) => f.patternId);
  const user = [
    "This player's report. The token values are shown so you know what each token will say; write the tokens, never the numbers.",
    "```json",
    JSON.stringify(data, null, 2),
    "```",
    ids.length > 0
      ? `Word these focus items, in this order: ${ids.join(", ")}. Then answer with the JSON object only.`
      : "There are no focus items to word this time; answer with the summary and an empty focus array, as the JSON object only.",
  ].join("\n");
  return { system: SYSTEM, user };
}
