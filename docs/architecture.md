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
3. **Patterns** turns flagged moves into named, recurring mistake types (`PatternFinding`):
   for example leaving a piece undefended, missing a one-move tactic, losing a won endgame,
   collapsing under ten seconds on the clock, leaving theory early in the same opening.
4. **Progress** turns findings into rates per 100 of the player's moves (`PatternStat`) for a
   period, and compares the period since the last report with the one before it.
5. **Coach** gives a model the stats, the player's rating band and a few example positions, and
   gets back at most two `FocusItem`s plus a note on how last week's items moved.

Code decides what happened. The model only chooses what to say about it.

## Built

- `contracts`: all the shapes above, rating bands, judgment thresholds.
- `ingest`: both platforms, newest first, `since` filtering.
- `engine`: UCI driver, PGN replay with clocks, per-move scoring.
- `coach`: model routing table only.
- `cli`: `fetch`, `analyze`, `eval`, `models`.

## Not built yet, in order

1. `patterns`: the detector interface and the first detectors, each with positions as tests.
2. `progress`: per-period `PatternStat`s and the improved / flat / worse verdict, including
   the "not enough games to say" case.
3. `coach`: prompts, Claude and Gemini providers, structured output validated against
   `WeeklyReport`.
4. Storage behind an interface (SQLite for self-hosting) so analyses are computed once.
5. `report` CLI command that runs the whole loop, then a minimal self-host web page.

## Open questions

- **Winning-anyway moves.** Going from +8 to +4 loses many win-probability points and changes
  nothing. Detectors should probably ignore losses where the player stays clearly winning, or
  weigh them by whether the result was at risk.
- **Rating pools.** Bands are on a Chess.com-rapid-like scale; Lichess ratings run higher and
  bullet/blitz/rapid differ. Where does conversion live, and is it per time class?
- **Sample size.** How many games make a pattern "recurring", and how many new games before a
  progress verdict is honest rather than noise?
- **Depth.** Depth 12 is fast and noisy. Is a second, deeper pass on flagged moves only the
  right trade?
