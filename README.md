# Blunderstruck

Find the chess mistakes you keep making, get at most two things to fix, and see next week
whether you actually fixed them.

Blunderstruck pulls your games from Chess.com or Lichess, analyses them with Stockfish, groups
your errors into recurring patterns, and asks an AI coach (Claude or Gemini, with your own
key) for advice sized to your rating. Then it checks your next batch of games against the
same patterns.

> Early days. Game import, Stockfish analysis and pattern detection work today. Progress
> tracking and the coach are being built; see [docs/architecture.md](docs/architecture.md).

## Try it

Requires Node 22+, pnpm, and Stockfish (`brew install stockfish` or your package manager).

```bash
pnpm install
pnpm cli fetch lichess <your-username> --max 20
pnpm cli analyze data/lichess-<your-username>.json --player <your-username>
pnpm cli patterns data/lichess-<your-username>.json --player <your-username>
```

`analyze` lists the mistakes in one game. `patterns` analyses every game in the file (results
are cached next to it, so a second run is fast) and prints your top two habits with example
positions. Every pattern is still counted: add `--all` to see them all and your repeated
opening mistakes.

The output looks like this (illustrative):

```
https://lichess.org/abcd1234
you as white (loss), 34 moves, Stockfish 19 depth 12, 1.8s
  12.   Nd5     mistake    -11.2 win%   best c1e3
  19.   Qxb7    blunder    -31.0 win%   best f1e1
```

Copy `.env.example` to `.env` for optional settings. No key is needed for import or analysis.

## Licence

AGPL-3.0-only. You may run, change and self-host it. If you offer a modified version to
others over a network, you must publish your changes. Stockfish is a separate GPL-3.0 program
that Blunderstruck runs as its own process.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
