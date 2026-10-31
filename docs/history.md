# Metagame: history

Session log and decisions. CLAUDE.md holds the current state; this file holds how it got there.

## Session 1 (2026-10-31): repo, core, Blotto, evaluation, CLI

Built the Vite + React + TypeScript scaffold with Vitest, the DOM-free engine tsconfig, the copied
StrategyLab RNG and Wilson interval (commit 4221b850e07914b02da1cf2342cc6ff62d6f02e0), named seed
streams, the mean interval, the payout module, Colonel Blotto, CRN evaluation with paired comparison,
the evaluate CLI, docs and CI.

### Verification

- DOM guard: `export const pageTitle = document.title;` in `src/engine/core/domProbe.ts` made
  `npm run build` fail with `TS2584: Cannot find name 'document'`; removed, build clean.
- Mutation 1, tied castles to the lowest-index player (`scoreRound`): 4 tests failed (7.5-7.5 tie,
  empty castle split, identical allocations tie, first-place excludes ties). The exact anchors did
  not fail, because the enumeration uses the same `scoreRound`.
- Mutation 2, sampler switched to normalised independent uniforms: 19 tests failed (uniformity
  chi-square 153,633 vs 42.92, all 15 exact anchors, both coverage tests, the draw-count test).
- Both reverted with `git checkout`; 78 of 78 tests pass.
- Pushed to `iangopen/metagame`; CI run 41241306399 (test, build, CLI smoke run) passed in 14 s.

### Decisions made outside the prompt

- StrategyLab has no standalone standard-error-of-a-mean interval (it computes SEs inline per stat),
  so `core/meanInterval.ts` is new code, next to the copied `interval.ts`.
- `deriveSeed(master, label, i) = sessionSeed(master ^ labelHash(label), i)`, `labelHash` = FNV-1a
  then splitmix32. New file `core/seeds.ts`; `rng.ts` is untouched.
- Ties in points use a relative tolerance of 1e-9 so fractional castle shares (1/3 + 1/3 + 1/3) tie
  with exact integers.
- A rank vector shorter than the player count pays 0 to the missing ranks; longer is an error.
  Win/lose is stored as `rank [1]` and printed as `winlose`.
- The exact-anchor tests assert |z| < 4 (StrategyLab's standard) and print whether the 95% interval
  contains the exact value (14 of 15 did); 95% calibration is asserted by the 200-seed coverage test.
- The CRN width test asserts on nearby allocations. The CLI pair (very different allocations) has a
  paired/independent width ratio of 1.06, so it is documented, not asserted.
- The prompt asked for a new empty folder; this folder already had a git repo with a one-line
  UTF-16 README and an `origin` remote to `iangopen/advancedstrategylab`. The README was replaced,
  `origin` now points at `iangopen/metagame`, and the old remote is kept as `advancedstrategylab`
  (that GitHub repo was not pushed to or changed).
