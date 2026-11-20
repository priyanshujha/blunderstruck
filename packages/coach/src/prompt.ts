import {
  BAND_RUBRIC,
  focusTokenValues,
  PATTERN_IDS,
  type PatternId,
  RATING_BANDS,
  type ReportDraft,
  SUMMARY_TOKENS,
  summaryTokenValues,
} from "@blunderstruck/contracts";
import { WORDING_FOCUS_TOKENS } from "./validate";

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
        },
        required: ["patternId", "title", "why", "drill"],
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
  focusCount: "number of focus items",
};

/** A worked example of a good answer. It passes `parseWording` for focus ids hung-piece, missed-tactic. */
const EXAMPLE = {
  summary:
    "Over {games} games you made {mistakeRate} mistakes per hundred moves. The habits below did most of the damage, and they are very fixable.",
  focus: [
    {
      patternId: "hung-piece",
      title: "Pieces left out in the open",
      why: "In {gamesAffected} of your {games} games a piece was simply left to be taken, and this one keeps coming back. The knight on f6 in the first example had nobody looking after it.",
      drill:
        "Before you let go of a piece, ask one question: after this move, what can be taken? A short set of hanging-piece puzzles each day, until the check runs on its own.",
    },
    {
      patternId: "missed-tactic",
      title: "Forks that went unplayed",
      why: "You had a winning tactic and played something quieter in {gamesAffected} of your {games} games. In the second example Nd5 forked queen and rook; the move played let both escape.",
      drill:
        "Look at every check, capture and threat before choosing a move, even when the position feels calm. Solve 10 fork puzzles a day, each one two moves deep.",
    },
  ],
};

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
  "- Example positions are given as FEN with the move played, the engine's best move and a short fact. You may refer to squares, pieces and moves from them (\"the knight on f6\", \"Nd5 was a fork\"). Do not invent positions, moves or facts that are not given.",
  "- Earlier focus items may come with a verdict: \"improved\", \"flat\" (no clear change), \"worse\" or \"insufficient-data\" (not enough games yet). Mention an improvement warmly in the summary. Do not call \"flat\" or \"insufficient-data\" a failure.",
  "- Directly under your text, the program prints for each focus item a line with how many recent weeks it came back in (only when at least three weeks were counted), and a line with its current rate, its starting rate and its target. Do not restate them: the why says what happened and why it matters, and the drill says what to do.",
  "- Read gamesAffected in an item's token values before writing its why. When it is 1, write the singular (\"in a single game\"); when it equals games, say \"in each of your {games} games\".",
  "- You may mention persistence in words, without numbers (\"this one keeps coming back\"), only when the item's reason has weeksCounted of three or more and weeksRecurred is more than half of weeksCounted. Otherwise say nothing about how often it recurred.",
  "- Size each drill to the player's band using the rubric below. One drill per item: a habit or a short daily routine the player can actually do this week.",
  "",
  "# Patterns",
  "Each focus item has one of these pattern ids:",
  ...PATTERN_IDS.map((id) => `- ${id}: ${GLOSSARY[id]}`),
  "",
  "# Rating bands",
  "The player's band decides how simple the advice must be and which patterns may be focus items:",
  bandLines(),
  "",
  "# Numbers are written as tokens",
  "Never write the player's numbers yourself. Write a token in braces and code fills in the number, because a wrong number in a report is worse than no number.",
  "How many games, times or weeks something happened to the player is written only with its token, never as a number of your own, in digits or in words. No percentages, fractions of their games or rates, in any field. Numbers that describe a position, a clock or what to practise are fine as they are: \"Nd5 forked two pieces\", \"with 1 second left\", \"solve 15 puzzles a day\", \"play 3+2 games this week\". The report prints the weeks, rate and target lines itself, so leave those out entirely. When an item's gamesAffected is 0 (a kept item that stayed away this period), say it stayed away and to keep the habit going; never write \"{gamesAffected} of\" or \"0 of\" for it.",
  "Tokens allowed in a focus item's title, why and drill:",
  ...WORDING_FOCUS_TOKENS.map((t) => `- {${t}}: ${FOCUS_TOKEN_MEANING[t]}`),
  "Tokens allowed in the summary:",
  ...SUMMARY_TOKENS.map((t) => `- {${t}}: ${SUMMARY_TOKEN_MEANING[t]}`),
  "Rules:",
  "- Use only the tokens listed for that field, spelled exactly, in single braces. No other braces anywhere.",
  "- Good: \"in {gamesAffected} of your {games} games\", \"you hung a piece {occurrences} times\".",
  "- Bad: \"in 9 of 31 games\", \"9/31 games\", \"40%\", \"you hung a piece in nine games\", \"half of your games\", \"2 per 100 moves\". Write \"per hundred moves\" in words.",
  "- Do not write how many items there are (\"two habits\", \"both\"); use {focusCount} in the summary if you need the number.",
  "- {mistakeRate} is a decimal per hundred moves: write \"{mistakeRate} mistakes per hundred moves\", never \"{mistakeRate}%\".",
  "",
  "# Output",
  "Answer with one JSON object and nothing else:",
  "- summary: two or three sentences on the period as a whole, at most 600 characters, using only the summary tokens.",
  "- focus: one entry per focus item you are asked to word, in the order given, each with:",
  "  - patternId: exactly the id given;",
  "  - title: a short headline, at most 60 characters;",
  "  - why: why this matters for this player, at most 400 characters;",
  "  - drill: one concrete drill sized to the band, at most 400 characters.",
  "Sometimes only some focus items are asked for, because the others already have their text; word only those, and still write the summary for the whole report.",
  "",
  "Example of a good answer for a club player whose focus items are hung-piece then missed-tactic. Its squares, moves and examples are illustrative only: never reuse them; refer only to the positions you are given.",
  "```json",
  JSON.stringify(EXAMPLE, null, 2),
  "```",
].join("\n");

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** The values of the tokens the wording may use; the printed lines' values are left out. */
function wordingTokenValues(f: ReportDraft["focus"][number], draft: ReportDraft): Record<string, string> {
  const all = focusTokenValues(f, draft);
  return Object.fromEntries(WORDING_FOCUS_TOKENS.map((t) => [t, all[t]]));
}

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
    summaryTokens: summaryTokenValues(draft),
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
      examples: f.examples.map((e) => ({
        fen: e.fen,
        played: e.played,
        ...(e.best ? { best: e.best } : {}),
        ...(e.evidence ? { fact: e.evidence } : {}),
        ...(e.motif ? { motif: e.motif } : {}),
        winPctLost: round(e.winPctLoss, 1),
      })),
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
