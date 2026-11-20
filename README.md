# Blunderstruck

Find the chess mistakes you keep making, get at most two things to fix, and see next week
whether you actually fixed them.

Blunderstruck pulls your games from Chess.com or Lichess and analyses each one once with
Stockfish. It sorts your mistakes into nine recurring patterns, such as hung pieces, missed
tactics or thrown wins. It then picks at most two of them to work on, chosen by how much they
cost you and how often they come back, and only from the patterns that suit your rating band.
Each later report counts the same patterns again in the games you played since, and says
whether they got rarer.

Code does all of the choosing and counting. A model (Claude or Gemini, with your own key) is
optional and only writes the words.

## Requirements

- Node 22.13 or newer. The database uses Node's built-in SQLite. Node 22 prints one
  experimental warning about it on each run; later versions do not.
- pnpm.
- Stockfish (`brew install stockfish`, or your package manager), either on `PATH` or named
  by `STOCKFISH_PATH`.

## Quick start

```bash
pnpm install
pnpm cli report lichess <user>
pnpm cli report chesscom <user>
```

**The first run** fetches your rated games and looks back 30 days. If those 30 days hold
fewer than 20 games, it goes back further, up to 90 days, until it has 20. It reports on one
time class (bullet, blitz, rapid or classical): the one you played most. Use
`--time-class <class>` to start a report for another one. Daily and correspondence games are
never used.

**Later runs** cover only the games played since the last report, and never use a game played
before the first report's period. If there are fewer than 10 new games, the run shows the last
report again and says how many more games a new one needs. `--now` makes a new report anyway;
such a report keeps the focus items as they were and does not count toward moving them on.

If two runs for the same player start at the same moment, the second one shows the report the
first one stored instead of storing its own.

To read the report in a browser on your own machine:

```bash
pnpm web lichess <user>
```

This serves the latest report at `http://127.0.0.1:4321/`, reachable from this machine only.
While games are still being analysed, the page refreshes itself every 30 seconds.

## The model key

A key is optional. Without one, the report still has every number and the focus items, with
plain built-in wording.

With a key, a model writes the summary and the text of each focus item. It never chooses the
items, and it never writes a number: it writes placeholders, and code fills in your numbers.

Copy `.env.example` to `.env` and set one of:

| Variable | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (`claude-opus-5-5`) |
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | Gemini (`gemini-3.8-flash`; `BLUNDERSTRUCK_GEMINI_SMART_MODEL` picks another) |

`report`, `db` and `pnpm web` read `.env` from the working directory; `--env <path>` reads
another file instead. A variable already set in your shell wins over the file.

If both keys are set, Claude is used. To choose, pass `--provider anthropic|gemini|none` or set
`BLUNDERSTRUCK_PROVIDER`; the flag wins over the variable. Naming a provider whose key is
missing is an error.

One report is one model call (two if a reply has to be repaired), of roughly 5,000 input
tokens, most of them a fixed prefix the provider caches, and 1,000 output tokens; set
`BLUNDERSTRUCK_MODEL_WEEKLY_PLAN` to use a different model, for example a cheaper Claude model.

Keep `.env` out of folders that sync to the cloud or to other people: anyone who can read the
file can use your key.

## Many games

If a period holds more than 150 games, the report first appears from a sample of 150 spread
evenly across its weeks. The rest are then analysed in the same run, and the report is updated
when they are done. To stop, press Ctrl-C: the game being analysed finishes, then the run
stops. A second Ctrl-C quits at once. Either way the games already analysed are kept, and the
next `report` run continues where this one stopped.

- `--sample-only` stops after the sample. A later run without it finishes the analysis.
- `--max-games N` analyses at most N of the period's games, chosen the same even way. The
  rest are never analysed.

## Your data

Everything is kept in one SQLite file, by default `~/.blunderstruck/blunderstruck.db`.
`--db <path>` or the `BLUNDERSTRUCK_DB` variable (in the shell or in `.env`) puts it
elsewhere.

A game is fetched and analysed once. Later runs reuse what is stored, unless the analysis
settings changed (a different depth or Stockfish version), in which case the games a report
needs are analysed again and the report says so.

To back up the database or move it to another machine:

```bash
pnpm cli db export backup.ndjson
pnpm cli db import backup.ndjson
```

The export is written to a temporary file and then renamed, so a failed export never leaves
half a file. It refuses to overwrite an existing file unless you pass `--force`. Importing the
same file twice changes nothing. The code only talks to storage through a small
interface (`Store` in `packages/store`), so another database can be added by implementing it.

## How to read the report

**Rates are per 100 of your own moves**, not per game, so weeks with different numbers of
games compare fairly.

**Each earlier focus item gets one of four verdicts**, comparing the new games with the 30 days
before them:

| Verdict | Meaning |
|---|---|
| improved | the rate fell by at least 20%, and a fall that large is unlikely to be chance |
| no clear change | neither improved nor worse |
| worse | the rate rose by at least 20%, and a rise that large is unlikely to be chance |
| not enough games yet | fewer than 10 games or 300 moves on either side, or too few mistakes of that kind to judge |

One week of games is a small sample, so only large changes show, roughly halving or rising by
half. "No clear change" is common, and does not mean the work is not helping.

**Why an item is on the list.** The report gives the reason, for example "It came up in 5 of
your last 6 weeks", together with its rate now, its rate when it was chosen, and its target (a
quarter lower).

**How an item leaves the list.** It graduates once it has been at or below its target, and not
worse, in two reports in a row that had enough games to judge. It can be swapped out after six
such reports if another pattern now costs you more, and it is dropped if your rating band
changes so that it no longer suits you. A graduated or swapped-out pattern is not chosen again
for the next two reports.

## Commands

All commands run from the repository root. `pnpm -s cli` with no arguments prints this list.

```
pnpm cli report <lichess|chesscom> <user> [--time-class <class>] [--depth 12] [--db <path>]
         [--provider anthropic|gemini|none] [--env <path>] [--band <band>]
         [--as-of <ISO date>] [--now] [--sample-only] [--max-games N] [--json] [--all]
pnpm cli db export <file> [--db <path>] [--force] [--env <path>]
pnpm cli db import <file> [--db <path>] [--env <path>]
pnpm web <lichess|chesscom> <user> [--port 4321] [--db <path>] [--time-class <class>] [--env <path>]
```

| `report` flag | Effect |
|---|---|
| `--time-class` | bullet, blitz, rapid or classical (default: the time class used before, or the one with the most recent rated games) |
| `--depth` | Stockfish search depth, 1 to 30 (default 12) |
| `--db` | database file |
| `--provider` | which model writes the wording; `none` uses the built-in wording |
| `--env` | read settings from this file instead of `./.env` |
| `--band` | rating band to coach for: novice, beginner, club, advanced or expert (default: from your ratings) |
| `--as-of` | end the period at this time instead of now; not earlier than the last report |
| `--now` | make a new report even with fewer than 10 new games |
| `--sample-only` | stop after the sample of 150 games |
| `--max-games N` | analyse at most N of the period's games |
| `--json` | print the stored report as JSON on stdout (messages go to stderr) |
| `--all` | also print the week-by-week table and every pattern's trend |

The CLI's number flags take digits only and are checked against their range: `--depth` is 1
to 30 (here and for `analyze`, `patterns` and `eval`), `--max-games` and `--max` are at least
1, `--index` is at least 0 and `--examples` is 0 to 2. A bad value exits with status 2. The web
`--port` is 0 to 65535.

Lower-level commands work on a JSON file of games instead of the database:

```bash
pnpm cli fetch lichess <user> --max 20
pnpm cli analyze data/lichess-<user>.json --player <user>
pnpm cli patterns data/lichess-<user>.json --player <user>
pnpm cli eval "<fen>" --depth 16
pnpm cli models
```

`analyze` lists the mistakes in one game. `patterns` analyses every game in the file (results
are cached next to it) and prints your top two habits with example positions; `--all` lists
every pattern and your repeated opening mistakes. `eval` asks Stockfish about one position,
and `models` prints which model handles which wording task.

`analyze` output looks like this (illustrative):

```
https://lichess.org/abcd1234
<user> as white (loss), 34 moves, Stockfish 19 depth 12, 1.8s
  12.   Nd5     mistake    -11.2 win%   best c1e3
  19.   Qxb7    blunder    -31.0 win%   best f1e1
```

Other optional settings are listed in `.env.example`: `BLUNDERSTRUCK_CONTACT` (sent to
Chess.com and Lichess in the User-Agent, as their API guidelines ask), `LICHESS_TOKEN` (raises
Lichess rate limits) and `BLUNDERSTRUCK_MODEL_WEEKLY_PLAN` (another model id for the wording).

How it all works is in [docs/architecture.md](docs/architecture.md).

## Licence

AGPL-3.0-only. You may run, change and self-host it. If you offer a modified version to
others over a network, you must publish your changes. Stockfish is a separate GPL-3.0 program
that Blunderstruck runs as its own process.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
