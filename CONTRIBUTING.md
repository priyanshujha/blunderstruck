# Contributing

Thanks for helping people blunder less.

## Before you open a pull request

You need Node 22.13 or newer (the store uses Node's built-in SQLite) and pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
```

- Tests must pass without network access, a Stockfish binary or a model key. Coach tests
  stub the provider (or inject `fetchImpl`) and never call a real model. Engine tests pass a
  stub `Evaluator`.
- Chess logic needs a test with a concrete position and the expected result. That includes
  stories, traits and blind spots.
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
3. **Code finds and counts mistakes; a model only words the report.** Detection, counting,
   verdicts and the choice of focus items are plain code over Stockfish output. A model sees
   aggregated numbers, blind spots and a few example stories, and words a report once per
   player per period: at most three calls (one, plus one repair and one reword). It never
   chooses the focus items. Never add a model call per move or per game.
4. **At most two focus items.** The contract enforces the limit; do not work around it.
5. **Keeping tests offline:** inject `fetchImpl` instead of calling the network, and pass a
   stub `Evaluator` instead of starting Stockfish.
6. **Be a polite API client.** Fetch Chess.com archives one at a time, send a User-Agent on
   every request, and do not add parallel fetching.
7. **Compatible licences** include GPL-3.0, MIT, Apache-2.0 and BSD.
8. **Thresholds live in the two `rules.ts` files.** Every progress threshold (periods,
   verdicts, priority, focus rules, sampling) is in `packages/progress/src/rules.ts`, and every
   pattern threshold (detectors, counting, blind spots) in `packages/patterns/src/rules.ts`.
   Do not write these numbers anywhere else, and say in the pull request when you change one.
9. **Sentences come from `packages/view`.** Every sentence and number a player reads is made
   there; the CLI and the web page only lay it out. Do not write report sentences in a front
   end. Keep the view's rules: past tense only for moves that were played, a capture or lost
   piece stated as fact only when the game played it, and a reason only when it is true on
   the board.
10. **A model never states a number or a move that is not on the record.** Numbers reach its
    text only through tokens that code fills in, and a move or square it names must be in that
    item's examples. The wording check (`packages/coach/src/validate.ts`) enforces both; do not
    loosen it to let a model's text through. Every report must still read well with the
    built-in wording and no key.
11. **A new store passes the conformance tests.** Implement the `Store` interface and run
    `storeConformance` from `@blunderstruck/store/conformance` against it in your tests. If you
    change the database shape, add a numbered migration and bump `SCHEMA_VERSION`.

## Licensing of contributions

The project is AGPL-3.0-only, and the maintainers also run a hosted service built on it. To
keep that possible, contributions are accepted under a contributor licence agreement that
lets the maintainers license your contribution under other terms as well. You keep the
copyright to your work. The agreement text and sign-off process will be linked here before
the first outside pull request is merged; until then, please open an issue before starting
substantial work.
