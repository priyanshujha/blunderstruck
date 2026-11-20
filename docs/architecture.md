# Architecture

## The loop

```
fetch games ──► analyse each game ──► detect patterns ──► weeks, verdicts, priorities ──► word ──► report
 (ingest)        (engine, Stockfish)    (patterns)          and focus (progress)          (coach)   (report)
     ▲                    │                                                                            │
     │                    └────────── every game and analysis is kept (store) ◄────────────────────────┤
     └──────────── next run: only games since the last report ◄────────────────────────────────────────┘
```

1. **Ingest** pulls finished standard games for a Chess.com or Lichess account into
   `GameRecord`s.
2. **Engine** replays each game, asks Stockfish for every position once, and scores each of the
   player's moves by the win probability it gave away (`AnalyzedGame`).
3. **Patterns** turns flagged moves into nine named mistake types (`PatternFinding`): missed
   mate, allowed mate, hung piece, allowed tactic, missed capture, missed tactic, thrown win,
   time trouble and opening trouble. Each finding carries a line of evidence text, and tactic
   findings may carry a motif tag. `summarize` gives every pattern a `PatternStat` and leads
   with at most two top habits; `patterns --all` lists them all.
4. **Progress** splits a track's games into weeks, judges each earlier focus item against the
   30 days before the period, scores every pattern by recent cost and persistence, and keeps,
   retires or chooses at most two focus items.
5. **Coach** writes the words: a summary and, per focus item, a title, a why and a drill. The
   words are token templates; code fills in the numbers.
6. **Report** runs the whole loop for one track and stores the result (`WeeklyReport`) in the
   **store**. The CLI prints it and the local web app serves it, both through **view**.

Code decides what happened and what to work on. A model only chooses how to say it.

## Built

- `contracts`: every shared shape (`GameRecord`, `AnalyzedGame`, `PatternFinding`,
  `WeeklyReport`, `ExportLine` and the rest), rating bands, the band rubric and rating-pool
  offsets, judgment thresholds, the wording tokens and `renderText`.
- `ingest`: both platforms, newest first, `since` filtering.
- `engine`: UCI driver, PGN replay with clocks, per-move scoring; stores the engine's main
  line for each move.
- `patterns`: nine detectors, the counting rules below, per-pattern stats, repeated opening
  positions and the top habits.
- `progress`: report weeks, the verdict test, the priority score, the focus rules and the game
  sampler. `src/rules.ts` holds every number.
- `store`: the `Store` interface, an in-memory store, the SQLite store, migrations, NDJSON
  export and import, and a conformance suite any store must pass.
- `coach`: model routing, Claude and Gemini providers over plain `fetch` with retries, key
  resolution, the prompt, the wording check and template wording.
- `report`: periods and tracks, the two-pass analysis, draft assembly and revisions.
- `view`: every sentence and table a report shows, shared by both front ends.
- `cli`: `report`, `db export`, `db import`, and the file-based `fetch`, `analyze`,
  `patterns`, `eval`, `models`.
- `web`: a local read-only page for one track.

## Not built yet, in order

1. Pins and skewers as tactic motifs.
2. A pattern for mistakes that carry no label (see "Open questions").
3. A deeper second pass on flagged moves only.
4. Rating-pool conversion that varies across the rating range instead of flat offsets.
5. The `position-explainer` and `progress-note` routes in `coach/src/models.ts` exist but are
   never called.

Not planned: daily and correspondence games, and one report across accounts on both sites.

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
`opening-trouble` describe the situation and may share a move with any other pattern. A
later hit in the same game from the same pattern with the same subject (the best move, the
piece and square, or the position) continues the earlier one and is counted once, as long as
the player made no other mistake in between. For the three missed-move patterns, a mistake in
between that missed the same best move keeps the streak going too.

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

## Progress rules

Every number below lives in `packages/progress/src/rules.ts` under the name given.
`MAX_FOCUS_ITEMS` (2) and `REPORT_WEEKS` (6) come from `contracts`, and `TOP_MIN_OCCURRENCES`
(2) and `TOP_MIN_GAMES` (2) from `patterns/src/rules.ts`; `rules.ts` re-exports them.

### Periods and tracks

A track is one player on one platform in one time class (`bullet`, `blitz`, `rapid` or
`classical`); its key is `<platform>:<username lowercased>:<timeClass>`. Only rated games of
those classes count.

- **Time class of a new track:** the class with the most games in the `FIRST_LOOKBACK_DAYS`
  (30) before `asOf`, else in the `MAX_LOOKBACK_DAYS` (90). Ties go rapid, blitz, classical,
  bullet. `--time-class` names a track; without it a run uses the player's only track, or the
  one with the newest report and lists the others.
- **First report:** `periodEnd = asOf`. `periodStart` is 30 days back when those days hold
  `BASELINE_TARGET_GAMES` (20) games, else the `playedAt` of the 20th-newest game within 90
  days, else 90 days back. Its weeks hold only its own games, and it has no comparison window.
- **Later report:** `periodStart` is the previous report's `periodEnd`. The fetch starts
  `FETCH_OVERLAP_DAYS` (3) earlier and asks for at most `FETCH_MAX` (20,000) games. The
  period's games are the track's games from that point to `asOf` that no earlier report lists
  in `gameIds`, so a game that finished late lands in the period that first sees it.
- **Never before the first period:** no report analyses or counts a game played before the
  track's earliest `periodStart`. A first report uses only its own period, so its comparison
  is null and its week table covers only that period.
- **Quiet week:** no new games returns the latest report unchanged; fewer than
  `MIN_REPORT_GAMES` (10) returns it with the number still needed. `--now` forces a report.
- **Few games:** a report built on fewer than 10 games (a first report, or a weekly one forced
  with `--now`) notes `few-games` and makes no model call. A first report then has no focus
  items; a weekly one keeps the previous final report's items as they were (same `since`,
  `baseline`, `target` and wording), retires nothing and adds nothing. Such a report is
  neutral for the focus rules: it does not count toward graduation, rotation or cooldown, does
  not break a run, and is not the source of previous ranks.
- **Comparison window:** track games in `[periodStart − COMPARISON_DAYS, periodStart)`
  (30 days), not in the period.
- **Weeks:** week `a` (0 is newest) is `(periodEnd − 7(a+1) d, periodEnd − 7a d]`, with
  `WEEK_DAYS` = 7, for `a` from 0 to 5.
- **`asOf`** defaults to now; `--as-of` earlier than the track's latest `periodEnd` is refused.
- **Settings:** analysis version, patterns version, engine name and depth (`DEFAULT_DEPTH`
  12). Analyses at other settings are never mixed in. When they change, the games a report
  needs are analysed again and it notes `settings-changed`; older reports are not rewritten.

### Verdict rule

`verdict(previous, current)` compares a pattern's stat in the comparison window (`kP`
occurrences in `nP` moves over `gP` games) with the period (`kC`, `nC`, `gC`).

- **Not enough data** (`"insufficient-data"`, `pValue` null) when `gP` or `gC` is below
  `MIN_VERDICT_GAMES` (10), `nP` or `nC` is below `MIN_VERDICT_MOVES` (300), or the expected
  current count `(kP + kC)·nC/(nP + nC)` is below `MIN_EXPECTED_EVENTS` (3).
- **Test:** conditional on the total `kP + kC`, the current count is
  `Binomial(kP + kC, nC/(nP + nC))` if nothing changed. The tails are summed exactly in log
  space, with no dependency.
- **Improved** when `P(X ≤ kC) ≤ ALPHA` (0.05) and `rateC ≤ rateP·(1 − MIN_RELATIVE_CHANGE)`
  (0.20); `pValue` is that tail.
- **Worse** when `P(X ≥ kC) ≤ 0.05` and `rateC ≥ rateP·1.20`; `pValue` is that tail.
- **Flat** otherwise, shown as "no clear change"; `pValue` is the smaller tail.

**Power.** With 52 findings in 4,000 moves before and 1,000 moves now (about one active week
against a month), a fall to 6 (−54%) is improved at p = 0.040, but 7 (−46%) is flat at
p = 0.075; a rise to 22 (+69%) is worse at p = 0.030, but 19 (+46%) is flat. Weekly reports
therefore see only changes of roughly half, and "flat" is the common answer.

### Priority score

`priorities()` scores every pattern over the six weeks, using findings from `summarize` run on
each week's games. For week `a`, `n_a` is the player's moves and `k_a` the findings not yet
covered (see below).

| Term | As computed |
|---|---|
| recency weight | `w_a = 2^(−a / HALF_LIFE_WEEKS)`, `HALF_LIFE_WEEKS` = 3 |
| weighted moves | `N = Σ w_a·n_a` |
| weighted findings | `K = Σ w_a·k_a` |
| rate | `r̂ = 100·(μ·PRIOR_MOVES/100 + K) / (PRIOR_MOVES + N)`, `PRIOR_MOVES` = 300, `μ = REFERENCE_RATES[pattern]` |
| severity | `L̂ = (SEVERITY_PRIOR_WEIGHT·SEVERITY_PRIOR + Σ w_a·Σ loss) / (SEVERITY_PRIOR_WEIGHT + K)`, prior 25 win% with weight 2 |
| recent cost | `Ĉ = r̂·L̂`, win% lost per 100 moves |
| recurred in week `a` | at least `TOP_MIN_OCCURRENCES` (2) uncovered findings in at least `TOP_MIN_GAMES` (2) games; a week with fewer than `MIN_WEEK_GAMES` (5) games is not counted (its moves and findings still enter `N` and `K`) |
| chronicity | `R = Σ w_a·[recurred] / Σ w_a` over counted weeks; 0 with fewer than `MIN_COUNTED_WEEKS` (3) counted weeks |
| score | `S = Ĉ·(1 + CHRONICITY_WEIGHT·R)`, `CHRONICITY_WEIGHT` = 1 |
| naive cost | `occurrences·avgWinPctLoss·100/moves` over the current period; shown, never ranked on |

`REFERENCE_RATES`, per 100 moves, are provisional: they come from a 68-game club sample.

| hung-piece | allowed-tactic | missed-tactic | missed-capture | missed-mate | allowed-mate | thrown-win | time-trouble | opening-trouble |
|---|---|---|---|---|---|---|---|---|
| 1.33 | 1.66 | 0.66 | 0.28 | 0.38 | 0.14 | 0.52 | 0.24 | 0.20 |

- **Eligible:** the pattern is in `BAND_RUBRIC[band].eligible`, the current period has at
  least 2 of its findings in at least 2 games, and it is not cooling down.
- **Greedy coverage:** each round scores the remaining eligible patterns on findings whose
  move (`gameId#ply`) no earlier pick covers. A pattern whose moves a higher pick already
  covers, so that its uncovered findings this period fall below the floor, is not ranked
  (eligible, `rank: null`) and can never be a focus item. The best is ranked next and its
  moves are covered. Ties go to more weeks recurred, then larger `K`, then `PATTERN_IDS` order.
- **Ineligible** patterns keep their round-one numbers and `rank: null`. The result lists
  ranked patterns first, then the rest in `PATTERN_IDS` order.

### Focus rules

`chooseFocus` reads the track's history: the latest revision of each earlier period, and only
final ones (`coverage.complete` or `coverage.sampleOnly`). Provisional revisions are ignored
everywhere here. A report has enough data for an item when its verdict there is not
"insufficient-data". Each item of the latest final report is checked in this order:

1. **Outgrown:** the band no longer allows the pattern.
2. **Graduated:** this report and the previous enough-data report holding it both have its
   rate at or below `target` and a verdict other than "worse" (`GRADUATE_AFTER_REPORTS` = 2).
   Reports without enough data are skipped; they neither count nor break the run.
3. **Rotated:** it has `ROTATE_AFTER_REPORTS` (6) enough-data measurements while held, this
   one included, and an eligible pattern not held scores higher.
4. **Kept** otherwise, with its `since`, `baseline` and `target` unchanged.

Graduated and rotated patterns cannot be chosen for the next `COOLDOWN_REPORTS` (2) final
reports, few-games reports not counted. Free slots, up to two, are filled in rank order from ranked, choosable patterns,
never with one retired in the same report. A new item gets `since = periodEnd`, its current
stat as `baseline`, and `target = baseline·(1 − TARGET_REDUCTION)` with `TARGET_REDUCTION` =
0.25. Its kind is "returned" if it was ever retired, "rose" if its previous rank was
`ROSE_MIN_PREVIOUS_RANK` (3) or lower or absent in the last final report that was not a
few-games one (never on a track's first report), else "new".
Each item carries at most `MAX_EXAMPLES` (2) example positions, largest losses first,
preferring separate games.

### Two-pass analysis

`selectGames(games, cap, end)` sorts by `(playedAt, id)`, buckets into the report weeks ending
at `end` (older weeks continue back as needed), gives each bucket
`min(SAMPLE_MIN_PER_BUCKET, size)` (5), shares the rest of `cap` in proportion by largest
remainder (ties to the newer week), and picks evenly spaced indices within each bucket. The
result does not depend on input order.

- **Pass 1** analyses a `SAMPLE_GAMES` (150) sample of the period. On a weekly report with no
  comparable earlier analyses (a settings change), a 150-game sample of the comparison window
  and weeks is analysed too. The report is built, worded, stored as revision 0 and printed.
- **Pass 2**, in the same process, analyses every pending game the period, the comparison
  window and the weeks need, one at a time in `(playedAt, id)` order, saving each. It checks
  for Ctrl-C between games. When done it stores revision `rev + 1` with `complete: true`.
- **Resume:** every run first completes the track's unfinished reports, oldest first.
  `--sample-only` stops after pass 1 and marks the report `sampleOnly`; a later run without
  the flag completes it.
- **`--max-games N`** cuts the period to N games with the same sampler; the rest are never
  analysed. `gamesFound` keeps the true count and `coverage.total` is N.
- While provisional, the numbers use what is analysed, so more verdicts are "insufficient-data".

## Storage

`openSqliteStore(path)` uses Node's built-in `node:sqlite` (hence Node 22.13 or newer). The
path is `--db`, else `BLUNDERSTRUCK_DB`, else `~/.blunderstruck/blunderstruck.db`; parent
folders are created. Settings: `journal_mode = DELETE`, `busy_timeout = 5000`,
`foreign_keys = ON`; every write is its own `BEGIN IMMEDIATE` transaction.

| Table | Key | Holds |
|---|---|---|
| `meta` | `key` | `schema_version` |
| `tracks` | `track_key` | the track and when it was created |
| `games` | `id` | the `GameRecord`, with indexed lowercase usernames and `played_at` |
| `analyses` | `(game_id, analysis_version, depth, engine)` | one `AnalyzedGame` per game and setting |
| `period_stats` | `(track_key, period_end, settings_key)` | one `PeriodStats` per week, written for final reports only; the web page's full-history table |
| `reports` | `(track_key, period_end)` | the latest revision of each period's `WeeklyReport`, with `period_start` |

- **Analysis key:** analysis version, depth and engine name. A stored analysis is reused
  only when all three match.
- **Reports:** `putReport` replaces a stored report only with a higher revision (else
  `"stale"`), and refuses (`"conflict"`) a report whose period overlaps another stored period
  of the same track; periods that only touch are fine. A run that loses that race to another
  run started at the same moment stores nothing and returns the stored report, flagged
  `lostRace`; the CLI says so and shows it.
- **Migrations:** numbered, append-only functions in `migrations.ts`, each in its own
  transaction on open (`SCHEMA_VERSION` 1). A database from a newer version is refused.
- **Read-only open** (`{ readOnly: true }`, used by `db export` and the web app) never creates
  or migrates anything, rejects every write, and refuses a schema older or newer than the code.
- **Export** is NDJSON: a header line
  `{"type":"header","format":"blunderstruck-export","schemaVersion":1,"exportedAt":…}`, then
  `track`, `game`, `analysis` and `report` lines in a fixed order. `period_stats` is not
  exported; it is rebuilt. The CLI writes the export to `<file>.tmp` and renames it over
  `<file>`, refusing an existing file without `--force`. **Import** validates every line against `ExportLine`, refuses a
  newer schema, names the line number of the first bad line, and upserts, so importing twice
  changes nothing.
- `Store` is async throughout so another database can implement it; `storeConformance` in
  `store/src/conformance.ts` is the test suite it must pass.

## Coach

A model words a report once per player per period. `writeReport` makes one `weekly-plan`
call, plus at most one repair call when the answer fails the check, plus at most one reword
call when a provisional report's completed revision has focus items the first pass did not
(the reword gets no repair). That is at most three, counted in `wording.calls`. A completed
revision with the same items makes no call. Never a call per move or per game.

- **Route:** `weekly-plan` in `coach/src/models.ts`: `claude-opus-5-5` at effort medium with
  at most 4,000 output tokens, thinking included (a measured plan used about 1,000); for Gemini
  `gemini-3.8-flash`, or the id in `BLUNDERSTRUCK_GEMINI_SMART_MODEL`.
  `BLUNDERSTRUCK_MODEL_WEEKLY_PLAN` overrides the id for either.
- **Keys:** `resolveProvider` takes `--provider`, then `BLUNDERSTRUCK_PROVIDER`, then
  Anthropic if `ANTHROPIC_API_KEY` is set, then Gemini if `GEMINI_API_KEY` or `GOOGLE_API_KEY`
  is set, else none. A named provider without its key, or an unknown `BLUNDERSTRUCK_PROVIDER`,
  is a configuration error. Keys never appear in messages, the database or reports.
- **Transport:** plain `fetch`, injected for tests. 429, 500, 502, 503, 504 and 529 are retried
  up to twice, after 2 s then 8 s, or `retry-after` capped at 60 s. Any other failure, or a
  truncated answer, falls back to templates with the note `model-failed`. Each request times
  out after 60 seconds (`REQUEST_TIMEOUT_MS`). Gemini runs with thinking at the low level
  (`GEMINI_THINKING_LEVEL`), because thinking counts toward the output limit.
- **Prompt:** the system prefix is the same bytes for every player (voice, what the model may
  and may not decide, a glossary per pattern, every band's advice level and eligible patterns,
  the token rules, the output format and a worked example). Anthropic requests mark it for
  caching. The user part holds the band, the time class, each item's reason, baseline, target,
  token values and up to two example positions (FEN, move played, best move, evidence), the
  earlier items' verdicts and the retired items. The wording does not restate the weeks,
  rate and target lines: the report prints those from its own numbers right under it.
- **Tokens:** the model writes `{games}`, `{gamesAffected}`, `{occurrences}`, `{rate}`,
  `{baselineRate}`, `{target}`, `{weeksRecurred}`, `{weeksCounted}` in focus items and
  `{games}`, `{mistakeRate}`, `{focusCount}` in the summary. `renderText` fills them at display
  time and throws on anything else in braces. Counts are written with digit grouping
  ("1,500"); rates with two decimals. The weeks tokens are refused for an item with
  fewer than three counted weeks.
- **Wording check** (`parseWording`): the JSON shape, the pattern ids in the draft's order,
  lengths (title 60, why and drill 400, summary 600 characters), only allowed tokens, and the
  number rules, which differ by field:
  - The summary, title and why describe the player's record and hold no counts at all. Digits
    are allowed only in chess notation (moves in SAN, ranks, "move 12", "mate in 2"); number
    words other than "one" only right before a piece, pawn, move or square ("two rooks",
    "three moves deep"); fractions of the record ("a third of your games") are rejected.
  - The drill is advice, so study quantities pass ("three times a week", "5 puzzles"), but a
    statistic does not: percentages, ratios ("9/31"), "N of M games", rates ("per hundred"),
    decimals, or a count of what the player hung, lost or missed.
  It cannot catch vague counts ("most of your games") or check that what the text says about
  a position is true, and it rejects some harmless phrasing.
- **Templates:** one title, why and drill per pattern, with the drill at three levels (novice
  and beginner, club, advanced and expert). The why reads differently when the pattern
  occurred in none, one or all of the period's games (a kept item that stayed away gets a
  quiet-period line). They pass the same check, and are used when there is no key, the call
  fails, or the report has few games.

## View and front ends

`packages/view` turns a `WeeklyReport` into every sentence and table it shows (header,
coverage line, summary, focus items with reason, rates and examples, verdicts, retired items,
the week table, trends and notes). It renders tokens and never throws on stored wording: a
template that no longer renders is replaced by a plain sentence.

- **CLI** (`apps/cli/src/report-format.ts`) lays the view out as text. Progress goes to stderr;
  `--json` prints the stored report. Stockfish runs in its own process group, so the first
  Ctrl-C reaches only the CLI, which lets the current game finish and stops (exit 130); a
  second Ctrl-C kills the engine and exits at once. The next run continues.
- **Web** (`apps/web`) lays it out as HTML with inline CSS and no JavaScript, served by
  `node:http` on 127.0.0.1 from a read-only store. It reads `./.env` or `--env <path>` the
  same way `report` does, before resolving the database path. Routes: `/` (latest report),
  `/report/<periodEnd>`, `/report.json`; anything else is 404, and only GET and HEAD are
  answered. While games are pending it shows how many and refreshes every 30 seconds. The
  week table covers the track's full history from `period_stats`.

## Rating bands

Bands are on a Chess.com-rapid-like scale: novice up to 799, beginner 800 to 1199, club 1200
to 1599, advanced 1600 to 1999, expert 2000 and above. A report's band comes from the median
rating of the period's games in their own pool, moved onto that scale by `toBandScale`
(`rating − RATING_POOL_OFFSETS[platform][timeClass]`). `--band` overrides it; with no ratings
the previous report's band is used, else club.

`RATING_POOL_OFFSETS` are provisional flat values, derived from the rating comparison tables
at https://chessgoals.com/rating-comparison/ (page updated July 2026):

| Platform | bullet | blitz | rapid | classical |
|---|---|---|---|---|
| chesscom | −300 | −200 | 0 | 0 (no data) |
| lichess | 100 | 150 | 300 | 350 |

`BAND_RUBRIC` in `contracts/src/rubric.ts` decides which patterns may be focus items:

| Band | Eligible |
|---|---|
| novice | hung-piece, missed-capture, allowed-mate, missed-mate, thrown-win |
| beginner | novice's, plus allowed-tactic, missed-tactic, time-trouble |
| club | all nine |
| advanced | all except hung-piece and missed-capture |
| expert | missed-tactic, allowed-tactic, thrown-win, time-trouble, opening-trouble |

A pattern outside the band's list is still counted and shown; it is never a focus item.

## Open questions

- **Winning-anyway moves.** Resolved: see "Pattern rules".
- **Rating pools.** Resolved for now with flat per-pool offsets. The real gap varies across
  the rating range, Chess.com classical has no data, and the values have not been checked
  against real players.
- **Sample size.** Resolved for now: see the verdict thresholds and `MIN_REPORT_GAMES`.
- **Weekly verdict power.** A week of games registers only changes of about half. Should
  verdicts pool two or more periods, or compare against the item's frozen baseline instead?
- **Reference rates.** `REFERENCE_RATES` come from 68 club games on one platform. They shape
  every score while a player has few moves; they need a wider and per-band sample.
- **Wording check.** The allowlist rejects some harmless phrasing, which costs a repair call
  or falls back to templates. How often, and which notations still need allowing?
- **Cap bookkeeping.** Which games a `--max-games` report left out is not stored; it is
  recomputed with `selectGames` from the stored `gameIds`. Any change to the sampler changes
  that set for reports already stored.
- **Depth.** Depth 12 is fast and noisy. Is a second, deeper pass on flagged moves only the
  right trade? A Stockfish upgrade or depth change also re-analyses up to six weeks of games.
- **Unlabelled mistakes.** In a small club-level sample, roughly 70% of mistakes still carry
  no pattern label: they are positional or slow rather than one-move tactics. Is a pattern
  for them worth having, or is "no label" the honest answer?
- **Pins and skewers.** They count as tactics, but only forks, discovered attacks and mates
  are tagged with a motif so far.
- **Thresholds.** The values in `patterns/src/rules.ts` and `progress/src/rules.ts` were
  checked on a small sample from one platform. They need a wider look before they are treated
  as settled.
