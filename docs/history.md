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

## Session 2 (2026-11-15): search, crowds, robustness (branch `search-and-crowds`)

Built the `Game<C>` interface (Blotto and a new Guess-2/3 game), crowds as distributions over one
opponent's choice (uniform, point, heuristic, fixed list, mixture, level-k) with a plain-data
`CrowdSpec` and text syntax, `eval/play.ts` (any game, any crowd, same CRN streams; Blotto's
`evaluate` and `comparePaired` keep their signatures and numbers), `search` (sample-average
approximation under CRN: random pool or every choice up to 2,000, successive halving, hill climb,
final ranking, held-out re-evaluation), level-k up to k = 3, the strategy-by-crowd `robustness`
matrix, the engine's public `index.ts`, the `search` CLI, `--crowd` on `evaluate`, and a search smoke
step in CI. The usage limit hit before wrap-up; the wrap-up (this entry, full build, CI check,
CLAUDE.md tidy) was finished in a follow-up session the same day.

### Verification

- `npm test`: 177 tests in 19 files pass. `npm run build` clean end to end (re-run in the wrap-up).
  The session-1 `evaluate` output is identical to `main` apart from the runtime line.
- Search vs brute force on six small games (28 to 455 choices): point crowds 108 of 108 equal the
  brute-force maximum; uniform crowd 82 of 82 found the brute-force argmax of the sample objective;
  against exact values 114 of 120 found an exact best, the 6 misses near-ties within 4 SE (worst
  exact regret 0.0033).
- Held-out estimate, 100 seeds: the search's own estimate overstates by 0.0239 (z 10.3); held-out
  -0.0005 (z -0.18).
- Crowds: sampler chi-squares pass (mixture 14.24 vs 63.40; swapped weights 20,434). 30 cells against
  exact enumeration, max |z| 1.35, 24 of 24 intervals contain the exact value. Full size: SD across
  30 seeds 0.00160 vs reported SE 0.00172.
- Level-k: Guess-2/3 (3p, raw) levels 2 and 3 equal round(4y/7) and brute force; iterated from 100:
  57, 33, 19, 11, 6, 3, 2, 1.
- Runtime (5 castles, 100 soldiers): search quick 0.30 s, standard 1.67 s (2p) / 2.35 s (4p),
  thorough 9 to 11 s; level-k 1..3 1.66 s; robustness 6 x 5 at 20,000 rounds 0.76 s.
- README re-encode (wrap-up check): main's UTF-16 README decoded and diffed against the branch's UTF-8
  one. Every difference is an intended doc edit (model-uncertainty line, search commands and
  section, crowd table, status); intro, Out of scope and License unchanged; no non-ASCII or U+FFFD.
- CI run 43710590416 on `026602a` (test, build, evaluate and search smoke runs): green.

### Two fixes made after diagnosis

- Plateaus: the hill climb accepted only strict improvements and stalled at 6 points when 7 was
  reachable across an equal-valued step. It now accepts equal-or-better moves.
- Near-ties: the final ranking saw only climb endpoints, so a better choice met on the way could be
  dropped. It now ranks the best 16 choices met.

### Mutation demonstrations (rule 6; all reverted, suite green)

1. Holdout evaluated on the search seed instead of `deriveSeed(seed, "holdout", 0)`: 2 tests fail.
2. Hill climb back to strict improvement only: 1 test fails.
3. Final ranking inverted (worst first): 22 tests fail.
4. Mixture weights not normalised: 8 tests fail.
5. Mixture weights ignored: 8 tests fail.
6. Level k answering the base crowd instead of level k-1: 4 tests fail.
7. Robustness "best" taken as the minimum: 3 tests fail.

### Decisions made outside the prompt

- `Game<C>` introduced now, as the subset search and crowds need, rather than in session 5.
- Guess-2/3 added as a second game because the level-k anchor needs a closed form.
- Games with at most 2,000 choices are searched over every choice.
- The bias demonstration was redesigned. The first design ran at 2,000 rounds and measured z 3.59 for
  the search estimate's bias, below the 4 SE bar (only three or four choices sit within the noise, so
  the bias is about +0.0025). Rather than add seeds, it now runs at 200 rounds, where the SE (about
  0.03) is wider than the gaps among dozens of top choices; that gives z 10.3.
- README re-encoded from UTF-16 to UTF-8 in place after a delete of the file was declined.
