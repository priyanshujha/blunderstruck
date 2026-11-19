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

## Licensing of contributions

The project is AGPL-3.0-only, and the maintainers also run a hosted service built on it. To
keep that possible, contributions are accepted under a contributor licence agreement that
lets the maintainers license your contribution under other terms as well. You keep the
copyright to your work. The agreement text and sign-off process will be linked here before
the first outside pull request is merged; until then, please open an issue before starting
substantial work.
