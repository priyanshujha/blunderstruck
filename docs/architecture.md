# Architecture

## The loop

```
fetch games ──► analyse each game ──► detect patterns ──► aggregate per period ──► coach ──► report
 (ingest)        (engine, Stockfish)    (patterns)          (progress)            (coach)
     ▲                                                                                │
     └──────────── next week: only games since the last report ◄──────────────────────┘
```

1. **Ingest** pulls finished standard games for a Chess.com or Lichess account into `GameRecord`s.
2. **Engine** replays each game, asks Stockfish for every position once, and scores each of the
   player's moves by the win probability it gave away (`AnalyzedGame`).
3. **Patterns** turns flagged moves into nine named mistake types (`PatternFinding`): missed
   mate, allowed mate, hung piece, allowed tactic, missed capture, missed tactic, thrown win,
   time trouble and opening trouble. Each finding carries a line of evidence text, and tactic
   findings may carry a motif tag. The summary leads with at most three top habits, ranked by
   the win probability given away per 100 of the player's moves, each mistake counted once,
   with a floor of two occurrences in two games.
4. **Progress** turns findings into rates per 100 of the player's moves (`PatternStat`) for a
   period, and compares the period since the last report with the one before it.
5. **Coach** gives a model the stats, the player's rating band and a few example positions, and
   gets back at most two `FocusItem`s plus a note on how last week's items moved.

Code decides what happened. The model only chooses what to say about it.

## Built

- `contracts`: all the shapes above, rating bands, judgment thresholds.
- `ingest`: both platforms, newest first, `since` filtering.
- `engine`: UCI driver, PGN replay with clocks, per-move scoring; stores the engine's main
  line for each move.
- `patterns`: nine detectors, the counting rules below, per-pattern stats, repeated opening
  positions and the top habits.
- `coach`: model routing table only.
- `cli`: `fetch`, `analyze`, `patterns`, `eval`, `models`.

## Not built yet, in order

1. `progress`: per-period `PatternStat`s and the improved / flat / worse verdict, including
   the "not enough games to say" case.
2. `coach`: prompts, Claude and Gemini providers, structured output validated against
   `WeeklyReport`.
3. Storage behind an interface (SQLite for self-hosting) so analyses are computed once. The
   CLI only keeps a JSON cache of analyses next to the games file.
4. `report` CLI command that runs the whole loop, then a minimal self-host web page.

## Pattern rules

All thresholds live in `packages/patterns/src/rules.ts`. Win% is the mover's win probability,
0 to 100. Material is in pawns.

| Pattern id | Rule |
|---|---|
| `missed-mate` | The player had mate in two or fewer, played a move that did not mate, and is no longer mating afterwards. |
| `allowed-mate` | After the move the opponent mates in two or fewer; before it the player was not being mated and had more than 20% win. |
| `hung-piece` | A knight, bishop, rook or queen is left en prise with a net loss of at least 2 pawns (exchange count minus what the move won), and the engine's best reply or the actual reply lands on it. |
| `allowed-tactic` | The best and played lines differ by a tactic swing, and the played line (the move plus the engine's answer) is mated or loses at least 2 pawns. May carry a motif. |
| `missed-capture` | The missed-tactic condition holds and the engine's best move is a capture winning at least 2 pawns that the player did not make. |
| `missed-tactic` | The same swing condition, and the engine's line mates or wins at least 2 pawns. May carry a motif. |
| `thrown-win` | The player reached 85% win, did not win the game, and a later move of theirs left them below 70%. At most one per game, on the biggest drop. A game lost on time from a position still at 70% or better is not counted. |
| `time-trouble` | A countable move made with less than the clock threshold left: 10% of the base time plus 40 increments, but between 10 and 30 seconds. Games without clock data are skipped. |
| `opening-trouble` | A countable move at or before ply 24 whose position was a countable mistake by the player, same colour, in at least two games. |

**Winning-anyway rule.** A move counts only if it lost at least 10 win% (the mistake
threshold), left the player below 80% win, and was made from above 20% win. Going from +8 to
+4 changes nothing, and neither does a move from a lost position. `missed-mate` is the one
exception: it counts even when the player stays clearly winning, because it shows a habit of
not checking forcing moves.

**Exclusivity and streaks.** The first six patterns are tactical: a move gets at most one
tactical finding, and the earliest id in the table wins. `thrown-win`, `time-trouble` and
`opening-trouble` describe the situation and may share a move with any other pattern. A hit
on the player's next move from the same pattern with the same subject (the best move, the
piece and square, or the position) continues the earlier one and is not counted again.

**Stats.** A `PatternStat` divides a pattern's occurrences by the player's own moves across
all the analysed games, not by games or by all moves in them. Every pattern gets a stat, zeros
included. The top habits are chosen greedily: each round picks the pattern whose findings on
moves no earlier pick covers give away the most win%, per 100 of the player's moves. A move
covered by one habit is never paid for again, so the situation patterns only enter for loss
that the habits above them do not already explain.

**Opening trouble is keyed by position.** The key is the first four FEN fields of the
position before the mistake, so transpositions meet. The opening name from the game record is
shown for display only, because it varies with the move order.

**Analysis versions.** Analyses from `ANALYSIS_VERSION` 1 lack the engine's main line, which
the tactic patterns need. They are re-analysed, never compared; the same holds for any
analysis made at a different depth.

## Open questions

- **Winning-anyway moves.** Resolved: see "Pattern rules".
- **Rating pools.** Bands are on a Chess.com-rapid-like scale; Lichess ratings run higher and
  bullet/blitz/rapid differ. Where does conversion live, and is it per time class?
- **Sample size.** How many games make a pattern "recurring", and how many new games before a
  progress verdict is honest rather than noise?
- **Depth.** Depth 12 is fast and noisy. Is a second, deeper pass on flagged moves only the
  right trade?
- **Unlabelled mistakes.** In a small club-level sample, roughly 70% of mistakes still carry
  no pattern label: they are positional or slow rather than one-move tactics. Is a pattern
  for them worth having, or is "no label" the honest answer?
- **Pins and skewers.** They count as tactics, but only forks, discovered attacks and mates
  are tagged with a motif so far.
- **Thresholds.** The values in `rules.ts` were checked on a small sample from one platform.
  They need a wider look before they are treated as settled.
