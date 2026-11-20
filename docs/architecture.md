# Architecture

## The loop

```
fetch ──► first look ──► deeper check ──► patterns, stories, ──► weeks, verdicts, ──► word ──► report
(ingest)  (engine)       of flagged moves  traits, blind spots     priorities, focus     (coach)   (report)
                         (engine)          (patterns)              (progress)
   ▲                                                                                                │
   │            every game and analysis is kept (store); view turns a report into sentences ◄──────┤
   └──────────── next run: only games since the last report ◄──────────────────────────────────────┘
```

1. **Ingest** pulls finished standard games for a Chess.com or Lichess account into
   `GameRecord`s.
2. **First look.** The engine replays each game, asks Stockfish about every position once at
   the first-look depth (12), and scores each of the player's moves by the win probability it
   gave away (`AnalyzedGame`). It keeps the engine's main line for each move.
3. **Deeper check** (`engine/src/check.ts`). Every move of the player that lost at least 5 win%
   on the first look, or gave up a mate in two or fewer, is evaluated again at the check depth
   (18), from the position before it and the one after it. The result is stored beside the
   first look (`AnalyzedMove.check`); the first-look fields are never changed. `resolveChecked`
   gives the game as its checked values describe it: a checked move takes all its checked
   numbers and lines. The move right after a checked move starts from a position the check
   already searched, so it takes its best line from that deeper search, but keeps its
   first-look numbers. Every other move is as the first look left it.
4. **Patterns** reads the resolved game and turns countable mistakes into nine named mistake
   types (`PatternFinding`). For each focus example it builds a story, and for each mistake it
   reads traits; blind spots are traits much more common in one pattern than in the player's
   mistakes overall. See "Stories, traits and blind spots".
5. **Progress** splits a track's games into weeks, judges each earlier focus item against the
   30 days before the period, scores every pattern by recent cost and persistence, and keeps,
   retires or chooses at most two focus items. Each item carries its blind spots, its examples
   and a goal in games.
6. **Coach** writes the words: a summary and, per focus item, a title, a why, a drill and one
   step per blind spot. The words are token templates; code fills in the numbers.
7. **Report** runs the whole loop for one track and stores the result (`WeeklyReport`) in the
   **store**. **View** turns it into the sentences and numbers a player reads; the CLI and the
   web page both print the view.

Code decides what happened and what to work on. A model only chooses how to say it.

### Time

The deeper check is most of the cost: about 1.3 seconds a position at depth 18 on a laptop. A
first report on about 160 games took about half an hour. Rebuilding a report from stored
analyses takes seconds. `--check-depth 0` turns the check off.

## Built

- `contracts`: every shared shape (`GameRecord`, `AnalyzedGame` with its `MoveCheck`,
  `PatternFinding`, `ExampleStory`, `BlindSpot`, `HabitStep`, `WeeklyReport`, `ExportLine`
  and the rest), rating bands, the band rubric and rating-pool offsets, judgment thresholds,
  the wording tokens, `renderText`, and goals in games (`gameGoalOf`, `meetsGoal`).
- `ingest`: both platforms, newest first, `since` filtering.
- `engine`: UCI driver, PGN replay with clocks, per-move scoring with the engine's main line,
  and the deeper check of flagged moves (`checkMoves`, `checkGame`, `resolveChecked`).
- `patterns`: nine detectors, the counting rules below, per-pattern stats, repeated opening
  positions, the top habits, example stories (`story.ts`, `lost.ts`), traits (`traits.ts`) and
  blind spots (`blind-spots.ts`). `src/rules.ts` holds every number.
- `progress`: report weeks, the verdict test, the priority score, the focus rules, examples
  chosen per blind spot, and the game sampler. `src/rules.ts` holds every number.
- `store`: the `Store` interface, an in-memory store, the SQLite store, migrations, NDJSON
  export and import, and a conformance suite any store must pass (`@blunderstruck/store/conformance`).
- `coach`: model routing, Claude and Gemini providers over plain `fetch` with retries, key
  resolution, the prompt, the wording check and the built-in wording.
- `report`: periods and tracks, the two-pass analysis with the deeper check, draft assembly
  and revisions.
- `view`: every sentence and table a report shows, including the example stories, shared by
  both front ends.
- `cli`: `report`, `db export`, `db import`, `models`, and the file-based `fetch`, `analyze`,
  `patterns`, `eval`.
- `web`: a local read-only report page for one track, with boards that play each example, and
  `@blunderstruck/web/render` to build the same page without the server.

## Not built yet, in order

1. Blind-spot progress over time: whether a blind spot itself got rarer between reports.
   Today only the pattern gets a verdict.
2. Pins and skewers as tactic motifs. Only forks, discovered attacks and mates are tagged.
3. A pattern for mistakes that carry no label (see "Open questions").
4. Thresholds checked on more than mainly club-level games (see "Open questions").
5. Rating-pool conversion that varies across the rating range instead of flat offsets.
6. The `position-explainer` and `progress-note` routes in `coach/src/models.ts` exist but are
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

**Analysis versions.** `ANALYSIS_VERSION` is 3. Analyses from an earlier version, at a
different first-look depth or check depth, or from another engine build are re-analysed, never
compared. The detectors read the game through `resolveChecked`, so with the check on a
flagged move is judged on its deeper numbers.

## Stories, traits and blind spots

All of this is read from the stored analysis by replaying its lines with legal-move rules. No
engine call is made. Thresholds are in `packages/patterns/src/rules.ts`.

### Example stories

`storyOf` (`patterns/src/story.ts`) tells one finding as an `ExampleStory`:

- **What the move allowed** (`punish`): the engine's answer to the move played, cut after its
  last capture, promotion, check or mate, at most 8 plies. This is the engine's line, not the
  game. `lost` and `lostFor` name the piece it cost and what was won for it (`lineLoss` in
  `lost.ts`): trades are cancelled first, a piece promoted in the line and then taken counts
  as the pawn it was, and a piece is named only for a net loss of at least a minor piece for a
  pawn.
- **The better move** (`better`): the engine's line from the position before the move, cut
  the same way, with a reason by the first rule that holds: it mates, it wins material, it
  covers the square of the key reply, it stops the key reply, or it holds the material level.
  A reason is given only when it is true on the board.
- **The key move**: the move in the line that forks, opens a line from a piece behind it, or
  otherwise starts the tactic.
- **What the game played** (`inGame`): the next few moves the game really played, cut the same
  way. `followed` says how many plies of the engine's line the game played.

`inGame.paid` says whether the game took what the move allowed. First a paid stretch of the
game is looked for, by the first rule that applies:

1. the game played the punishing line through its last capture, promotion or mate, the line
   was not cut at 8 plies, and the game's next move does not recapture on a square taken on
   in that stretch;
2. the punishing line ends in mate, and the game mated the player within as many plies;
3. the opponent's very next move took the named lost piece on its square, and the captures on
   that square ended within 8 plies;
4. the opponent's next move was the first move of the punishing line, the player answered
   without capturing and left the lost piece where it stood, and the opponent's very next
   move took it there.

A piece that is taken later than that is not counted: by then another move of the player's
may be the reason, and that move has its own example.

A stretch found this way is paid only when the player is mated in it, or when the player's net
loss over it, and over every game ply replayed (up to 10), is at least one pawn and at least
what the engine's line costs. A game that won the material back is never told as having cost
it.
`inGame.mated` is set when the punishing line ends in mate and the game's mate falls inside the
stretch; only then is a mate stated as the move's cost. `net`, `lost`, `lostFor` and `exchange`
are set on `inGame` only when it is paid. A story stored before `paid` existed has no `paid`
field; the view then states no cost either way, since whether the game paid is unknown.

The view writes in the past tense only about moves that were played. The engine's line is
"what the move allowed", and the better move is "what was better", never "what happened".

### Traits

`traitsOf` (`traits.ts`) reads facts about each mistake from the two stored lines. For the
"allowed" patterns (allowed mate, hung piece, allowed tactic) they come from the punishing
line: the answer gives check or a knight check, looks like a fork or a discovered attack, the
piece just moved was the one lost (after moving onto an attacked square, or after a capture),
a piece that had not moved was lost to the opponent's last move attacking it, the lost piece was undefended, and which piece was
lost. For the "missed" patterns (missed mate, missed capture, missed tactic) they come from
the best line: it starts with a check, a knight move, a capture or a quiet move, it takes the
piece that just moved, or it looks like a fork or a discovered attack. Both kinds also note the
move-number range. Fork and discovered-attack traits are a heuristic; the rest are exact for
the stored line, which is one refutation, not all of them. Thrown win, time trouble and opening
trouble have no traits and so no blind spots.

### Blind spots

A blind spot (`blind-spots.ts`) is a trait much more common among one pattern's occurrences
than among all of the player's countable mistakes. It is computed per focus item over the
report's six weeks (a first report uses its own period), never before the track's first period.
A trait is a blind spot when all of these hold:

| Rule | `rules.ts` name | Value |
|---|---|---|
| occurrences with the trait | `BLIND_SPOT_MIN_COUNT` | at least 4 |
| spread over games | `BLIND_SPOT_MIN_GAMES` | at least 3 |
| share of the pattern's occurrences | `BLIND_SPOT_MIN_SHARE` | at least a quarter |
| lift over the player's mistakes overall | `BLIND_SPOT_MIN_LIFT` | at least 1.5 times their share |

The comparisons are done in integers. At most `BLIND_SPOT_MAX` (3) are kept per item, by count,
then games. A narrower trait (a knight check under "gives check") is never chosen on its own;
it is attached to its parent when it holds for at least 3 occurrences and a third of the
parent's. Each blind spot has up to two examples, and the item's example `i` shows blind spot
`i` when one fits.

Each blind spot gets exactly one practice step (`HabitStep`). Its text is a token template
that may use only `{count}`, `{of}` and `{games}`.

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
- **Settings:** analysis version, patterns version, engine name, first-look depth
  (`DEFAULT_DEPTH` 12) and check depth (`DEFAULT_CHECK_DEPTH` 18 in `report`; 0 for none).
  Analyses at other settings are never mixed in. When they change, the games a report
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
2. **Graduated:** this report and the previous enough-data report holding it both meet its
   goal in games (`meetsGoal`) with a verdict other than "worse" (`GRADUATE_AFTER_REPORTS` = 2).
   Reports without enough data are skipped; they neither count nor break the run.
3. **Rotated:** it has `ROTATE_AFTER_REPORTS` (6) enough-data measurements while held, this
   one included, and an eligible pattern not held scores higher.
4. **Kept** otherwise, with its `since`, `baseline` and `target` unchanged.

Graduated and rotated patterns cannot be chosen for the next `COOLDOWN_REPORTS` (2) final
reports, few-games reports not counted. Free slots, up to two, are filled in rank order from ranked, choosable patterns,
never with one retired in the same report. A new item gets `since = periodEnd`, its current
stat as `baseline`, and a goal in games, `gameGoalOf(baseline)`: a quarter fewer of the games
affected. With `t = 0.75 × gamesAffected / games`, the goal is "at most `floor(10t)` in every 10
games" when `t` is at least one half, else "at most 1 game in `N`" with `N` about `1/t`, made
strictly below the baseline share. Integer arithmetic throughout. An item stored before goals
in games derives its goal the same way. `target = baseline·(1 − TARGET_REDUCTION)` (0.25) is
still stored per 100 moves for older readers; nothing is judged on it. Its kind is "returned" if it was ever retired, "rose" if its previous rank was
`ROSE_MIN_PREVIOUS_RANK` (3) or lower or absent in the last final report that was not a
few-games one (never on a track's first report), else "new".
Each item carries at most `MAX_EXAMPLES` (2) example positions, each with its story. Example
`i` is the largest loss with blind spot `i`, in a game not yet shown; without one, largest
losses first, preferring separate games. A kept item keeps its examples while they are still
findings. Each item also carries its blind spots and the window they were computed over.

### Two-pass analysis

`selectGames(games, cap, end)` sorts by `(playedAt, id)`, buckets into the report weeks ending
at `end` (older weeks continue back as needed), gives each bucket
`min(SAMPLE_MIN_PER_BUCKET, size)` (5), shares the rest of `cap` in proportion by largest
remainder (ties to the newer week), and picks evenly spaced indices within each bucket. The
result does not depend on input order.

- **Pass 1** gives a first look to a `SAMPLE_GAMES` (150) sample of the period. On a weekly
  report with no comparable earlier analyses (a settings change), a 150-game sample of the
  comparison window and weeks gets one too. The report is built from first looks, worded,
  stored as revision 0 and printed.
- **Pass 2**, in the same process, brings every game the period, the comparison window and the
  weeks need to the check depth, one at a time in `(playedAt, id)` order: a game with a first
  look is only checked, any other is analysed and then checked, and each is saved as soon as it
  is done. It checks for Ctrl-C between games and between a game's first look and its check.
  When done it stores revision `rev + 1` with `complete: true`. With the check on, a report
  counts only games checked for the player's colour.
- **Resume:** every run first completes the track's unfinished reports, oldest first.
  `--sample-only` checks the sample, stops, and marks the report `sampleOnly`; a later run
  without the flag completes it.
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
| `analyses` | `(game_id, analysis_version, depth, check_depth, engine)` | one `AnalyzedGame` per game and setting; check depth 0 is a first look |
| `period_stats` | `(track_key, period_end, settings_key)` | one `PeriodStats` per week, written for final reports only; the web page's full-history table |
| `reports` | `(track_key, period_end)` | the latest revision of each period's `WeeklyReport`, with `period_start` |

- **Analysis key:** analysis version, first-look depth, check depth and engine name. A stored
  analysis is reused only when all four match, except that a checked analysis also serves as
  the first look at its depth, since a check never changes first-look fields.
- **Reports:** `putReport` replaces a stored report only with a higher revision (else
  `"stale"`), and refuses (`"conflict"`) a report whose period overlaps another stored period
  of the same track; periods that only touch are fine. A run that loses that race to another
  run started at the same moment stores nothing and returns the stored report, flagged
  `lostRace`; the CLI says so and shows it.
- **Migrations:** numbered, append-only functions in `migrations.ts`, each in its own
  transaction on open (`SCHEMA_VERSION` 2; version 2 added `check_depth` to the analysis key). A database from a
  newer version is refused.
- **Read-only open** (`{ readOnly: true }`, used by `db export` and the web app) never creates
  or migrates anything, rejects every write, and refuses a schema older or newer than the code.
- **Export** is NDJSON: a header line
  `{"type":"header","format":"blunderstruck-export","schemaVersion":2,"exportedAt":…}`, then
  `track`, `game`, `analysis` and `report` lines in a fixed order. `period_stats` is not
  exported; it is rebuilt. The CLI writes the export to `<file>.tmp` and renames it over
  `<file>`, refusing an existing file without `--force`. **Import** validates every line against `ExportLine`, refuses a
  newer schema, names the line number of the first bad line, and upserts, so importing twice
  changes nothing.
- `Store` is async throughout so another database can implement it. `storeConformance`,
  exported as `@blunderstruck/store/conformance`, is the test suite it must pass: call it with
  a function that makes an empty store, inside your own test file.

## Coach

A model words a report once per player per period. `writeReport` makes one `weekly-plan`
call, plus at most one repair call when the answer fails the check, plus at most one reword
call when a provisional report's completed revision has focus items the first pass did not
(the reword gets no repair). That is at most three, counted in `wording.calls`. A completed
revision with the same items makes no call. Never a call per move or per game.

- **Route:** `weekly-plan` in `coach/src/models.ts`. `pnpm -s cli models` prints the table:

  | Task | Effort | Max output tokens | Anthropic | Gemini |
  |---|---|---|---|---|
  | `weekly-plan` | medium | 4,000 | `claude-opus-5-5` | `gemini-3.8-flash` |
  | `position-explainer` (unused) | low | 400 | `claude-haiku-5-5` | `BLUNDERSTRUCK_GEMINI_FAST_MODEL` |
  | `progress-note` (unused) | low | 500 | `claude-haiku-5-5` | `BLUNDERSTRUCK_GEMINI_FAST_MODEL` |

  `BLUNDERSTRUCK_GEMINI_SMART_MODEL` picks another Gemini model for the plan, and
  `BLUNDERSTRUCK_MODEL_WEEKLY_PLAN` overrides the id for either provider.
- **Keys:** `resolveProvider` takes `--provider`, then `BLUNDERSTRUCK_PROVIDER`, then
  Anthropic if `ANTHROPIC_API_KEY` is set, then Gemini if `GEMINI_API_KEY` or `GOOGLE_API_KEY`
  is set, else none. Keys come only from the environment, or from `./.env` or the `--env`
  file, where a variable already set in the environment wins. A named provider without its
  key, or an unknown `BLUNDERSTRUCK_PROVIDER`, is a configuration error. Keys never appear in
  messages, the database or reports.
- **Transport:** plain `fetch`, injected for tests. 429, 500, 502, 503, 504 and 529 are retried
  up to twice, after 2 s then 8 s, or `retry-after` capped at 60 s. Any other failure, or a
  truncated answer, falls back to templates with the note `model-failed`. Each request times
  out after 60 seconds (`REQUEST_TIMEOUT_MS`). Gemini runs with thinking at the low level
  (`GEMINI_THINKING_LEVEL`), because thinking counts toward the output limit.
- **Prompt:** the system prefix is the same bytes for every player (voice, what the model may
  and may not decide, a glossary per pattern, every band's advice level and eligible patterns,
  the token rules, the output format and a worked example). Anthropic requests mark it for
  caching. The user part holds the band, the time class, each item's reason, token values,
  blind spots with what each means, and up to two examples with their stories (what the move
  allowed, the better move, and what the game played, with whether the game took what the
  move allowed), the earlier items' verdicts and the retired items. The wording does not restate the weeks,
  rate and target lines: the report prints those from its own numbers right under it.
- **Tokens:** the model writes `{games}`, `{gamesAffected}` and `{occurrences}` in focus
  items, `{games}`, `{mistakesPerGame}` and `{focusCount}` in the summary, and `{count}`,
  `{of}` and `{games}` in a habit step. The rate, target and weeks tokens are refused in new
  wording because the report prints those lines itself; stored reports that use them, or
  `{mistakeRate}`, still render. `renderText` fills tokens at display time and throws on
  anything else in braces. Counts are written with digit grouping ("1,500").
- **Wording check** (`parseWording`): the JSON shape, the pattern ids in the draft's order,
  exactly one step per blind spot in order, lengths (title 60, why and drill 400, step 200,
  summary 600 characters), only allowed tokens, moves and squares named only when they appear
  in that item's examples (none in the summary), and the number rules, which differ by field:
  - The summary, title and why describe the player's record and hold no counts at all. Digits
    are allowed only in chess notation (moves in SAN, ranks, "move 12", "mate in 2"); number
    words other than "one" only right before a piece, pawn, move or square ("two rooks",
    "three moves deep"); fractions of the record ("a third of your games") are rejected.
  - The drill is advice, so study quantities pass ("three times a week", "5 puzzles"), but a
    statistic does not: percentages, ratios ("9/31"), "N of M games", rates ("per hundred"),
    decimals, or a count of what the player hung, lost or missed.
  It cannot catch vague counts ("most of your games") or check every claim about a position,
  and it rejects some harmless phrasing.
- **Kept text:** a later revision keeps an item's model text only with the same examples, and
  only while every move and square it names is still in their stories; otherwise the item is
  worded again in the reword call, or gets built-in wording when no call is left.
- **Built-in wording:** one title, why and drill per pattern, one step per blind spot, with the drill at three levels (novice
  and beginner, club, advanced and expert). The why reads differently when the pattern
  occurred in none, one or all of the period's games (a kept item that stayed away gets a
  quiet-period line). They pass the same check, and are used when there is no key, the call
  fails, or the report has few games.

## View and front ends

`packages/view` turns a stored `WeeklyReport` into every sentence and number a player reads:
header, coverage line, summary, focus items with their reason, frequency and goal in games,
blind spots and habit steps, example stories, verdicts, retired items, the week table, trends
and notes. Both front ends print what it returns and add no sentences of their own: every
sentence and number on the web page comes from `packages/view`, the page's own text from
`page.ts` and example titles from `titles.ts`. A two-way parity test in
`apps/web/src/render.test.ts` checks that every line the terminal prints appears on the page,
except a listed few the page says another way, and that every piece of text on the page is a
string of the view or one of a listed set of fixed labels. It
renders tokens and never throws on stored wording: a template that no longer renders is
replaced by a plain sentence. Rates per 100 moves appear only in the details.

Rules that keep the sentences true:

- Past tense only for moves that were played. The engine's line is what the move allowed;
  the better move is what was better.
- A capture or a lost piece is stated as fact only when the game played it (`inGame.paid`).
  A missed chance is what the better line wins beyond the move played.
- A trade is not a lost piece, and a reason for the better move is given only when it holds
  on the board.
- Frequencies and goals are said in games ("about 7 in every 10 games", "at most 1 game in
  4"), with one wording for each share.

- **CLI** (`apps/cli/src/report-format.ts`) lays the view out as text. Progress goes to stderr;
  `--json` prints the stored report. Stockfish runs in its own process group, so the first
  Ctrl-C reaches only the CLI, which lets the current game finish and stops (exit 130); a
  second Ctrl-C kills the engine and exits at once. The next run continues.
- **Web** (`apps/web`) lays it out as one HTML page: the focus items, each with its blind
  spots, steps and examples on a board that plays what the move allowed, the better move and
  what the game played; the earlier items' verdicts; and every pattern counted. The page has
  one inline stylesheet and one inline script, allowed by hash under a strict content security
  policy (`default-src 'none'`), and makes no other request. It is complete with scripts off;
  the script only plays the boards and adds conveniences, and never plays them under reduced
  motion. It is served by `node:http` on 127.0.0.1 from a read-only store. It reads `./.env` or `--env <path>` the
  same way `report` does, before resolving the database path. Routes: `/` (latest report),
  `/report/<periodEnd>`, `/report.json`; anything else is 404, and only GET and HEAD are
  answered. While games are pending it shows how many and refreshes every 30 seconds. The
  week table covers the track's full history from `period_stats`.
- **Demo:** `pnpm web --demo [--port 4321]` serves a made-up report for an invented player
  from an in-memory store (`apps/web/src/demo.ts`). It reads no database, `.env` or games and
  needs no Stockfish or key. Its stories are built by the real story builder, and
  `demo.test.ts` checks that they still match.
- **Building the page without the server:** `@blunderstruck/web/render` exports `renderPage`,
  `renderMessage` and `pageSecurity()`. Serve each page with the `Content-Security-Policy`
  from `pageSecurity()`. `PageOptions.basePath` prefixes every internal link for a page served
  under a path; `header` and `footer` are trusted HTML placed at the top and end of the body,
  never escaped, which must hold no report data and stay within that policy.

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
- **Depth.** The first look at depth 12 is fast and noisy; flagged moves are now checked at
  depth 18. Is 18 the right trade between time and noise, and should the check cover more
  moves? A Stockfish upgrade or a change of either depth re-analyses up to six weeks of games.
- **Unlabelled mistakes.** In a small club-level sample, roughly 70% of mistakes still carry
  no pattern label: they are positional or slow rather than one-move tactics. Is a pattern
  for them worth having, or is "no label" the honest answer?
- **Pins and skewers.** They count as tactics, but only forks, discovered attacks and mates
  are tagged with a motif so far, so no blind spot can name them.
- **Blind spots over time.** A blind spot is chosen afresh each report. Whether one got rarer
  is not measured yet; how to judge that on so few occurrences is open.
- **Thresholds.** The values in `patterns/src/rules.ts` and `progress/src/rules.ts`, the
  blind-spot limits included, were checked mainly on club-level games. They need a look at
  other rating bands and both platforms before they are treated as settled.
