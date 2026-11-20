# Contributing

Thanks for helping people blunder less.

## Before you open a pull request

```bash
pnpm install
pnpm typecheck
pnpm test
```

- Tests must pass without network access or a Stockfish binary.
- Chess logic needs a test with a concrete position and the expected result.
- Never commit real players' games, and never commit anything from `data/`. A fixture keeps
  only what its test needs, and both usernames are replaced with invented ones, in the JSON
  and in the PGN headers (White, Black, Site, Link). Drop the game URL and id, and prefer
  a short hand-written PGN.
- New dependencies must be compatible with AGPL-3.0.

## Engineering rules

1. **Shared shapes start in `packages/contracts`.** Change the schema there first, then the
   code that uses it. If the change is breaking, say so in the pull request description.
2. **Analysis is deterministic.** Stockfish runs at a fixed depth on one thread, with no
   time limits. If you change engine settings or judgment thresholds, bump
   `ANALYSIS_VERSION`; analyses from different versions are never compared.
3. **Code finds and counts mistakes; a model only words the advice.** Detection, counting
   and progress are plain code over Stockfish output. A model sees aggregated numbers and a
   few example positions. Never add a model call per move or per game.
4. **At most two focus items.** The contract enforces the limit; do not work around it.
5. **Keeping tests offline:** inject `fetchImpl` instead of calling the network, and pass a
   stub `Evaluator` instead of starting Stockfish.
6. **Be a polite API client.** Fetch Chess.com archives one at a time, send a User-Agent on
   every request, and do not add parallel fetching.
7. **Compatible licences** include GPL-3.0, MIT, Apache-2.0 and BSD.

## Licensing of contributions

The project is AGPL-3.0-only, and the maintainers also run a hosted service built on it. To
keep that possible, contributions are accepted under a contributor licence agreement that
lets the maintainers license your contribution under other terms as well. You keep the
copyright to your work. The agreement text and sign-off process will be linked here before
the first outside pull request is merged; until then, please open an issue before starting
substantial work.
