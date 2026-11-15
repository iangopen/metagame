# Metagame

Read this file in full at the start of every session. It says what the project is, the rules it must
never break, and what is actually done. If code and this file disagree, stop and flag it. The plan
for everything not yet built is in `ARCHITECTURE.md`; session history is in `docs/history.md`.

## What it is

Metagame simulates one-shot, simultaneous-move games against other people: several players choose at
once, a rule turns all choices into scores, and the answer depends on the crowd faced. It reports the
best found strategy against a stated crowd, with sampling uncertainty (intervals) and model
uncertainty (crowd sweeps) reported separately. It never claims a universally best strategy.
It reuses StrategyLab's seeded RNG and interval standards by copying them; StrategyLab
(github.com/iangopen/strategylab) stays untouched.

GitHub: `iangopen/metagame` (public). The local folder may be named `advancedstrategylab`.

## Commands

```
npm install
npm run build      # tsc -b over engine, engine tests, app and node configs, then vite build. The gate.
npm test           # vitest: "unit" project, then "stats" (*.stats.test.ts, Monte Carlo-heavy)
npm run dev        # placeholder page
npm run evaluate -- --alloc 15-0-41-44-0 [--compare A] [--players 2] [--payout winlose|raw|rank:9,4,2,0]
                   #   [--castles 1,2,3,4,5] [--soldiers 100] [--rounds 10000] [--seed 1] [--crowd SPEC]
npm run search -- [--players 2] [--payout ...] [--castles ...] [--soldiers 100] [--crowd SPEC]
                   #   [--budget quick|standard|thorough] [--robust uniform+even+levelk:1] [--include A] [--seed 1]
                   # SPEC: uniform | even | proportional | fixed:A/B | levelk:1..3 | mix:uniform=0.5,levelk:1=0.5
```

Windows/PowerShell is the primary machine, macOS the second. Every command must run in both: npm
scripts and tsx, no bash-only syntax. Never create files with `echo > file` in Windows PowerShell 5
(UTF-16); use the file tools.

## Layout

- `src/engine/` pure engine. Typechecked by `tsconfig.engine.json` (lib ES2023 only, no types), tests
  by `tsconfig.engine-test.json` (adds node types, still no DOM).
  - `core/rng.ts`, `core/interval.ts` (+ their tests): copied from StrategyLab at commit
    4221b850e07914b02da1cf2342cc6ff62d6f02e0, with a provenance header. Only imports may change.
  - `core/seeds.ts`: `deriveSeed(master, label, i)`, `deriveRng`, `randInt`. `core/meanInterval.ts`:
    Welford accumulator, `meanInterval` (mean ± 1.96 SE). `core/payout.ts`: raw / rank payouts with tie
    splitting, `isOutrightFirst`, `parsePayout` / `formatPayout`.
  - `games/blotto/blotto.ts`: params, validation, `scoreRound`, `randomAllocation` (stars and bars),
    `neighbour`, `encodeAllocation` / `decodeAllocation`, `enumerateAllocations`, `allocationCount`.
  - `core/game.ts`: `Game<C>`, what evaluation, search and crowds need from a game.
    `games/blotto/blottoGame.ts` adapts Blotto; `games/guess/guess.ts` is Guess-2/3 (level-k anchor).
  - `crowds/`: `crowd.ts` (uniform, point, heuristic, fixed list, mixture), `levelK.ts`, `spec.ts`
    (`CrowdSpec`, text syntax, `buildCrowd`).
  - `eval/play.ts`: any game against any crowd under CRN. `eval/evaluate.ts`: Blotto `evaluate`,
    `comparePaired`, now wrapping `play`.
  - `search/search.ts`: best found search with held-out re-evaluation. `robust/robustness.ts`:
    strategy-by-crowd matrix with per-cell intervals and paired regret.
  - `testing/exact.ts`: brute-force exact values, tests only. `index.ts`: the public surface the UI
    should import.
  - `isolation.test.ts`: no Math.random, React or DOM in engine sources.
- `scripts/evaluate.ts`, `scripts/search.ts`: the CLIs; `scripts/cli.ts`: shared argument parsing and
  formatting. `src/App.tsx`, `src/main.tsx`: placeholder page.
- `ARCHITECTURE.md`: the full plan. `.github/workflows/ci.yml`: tests, build, a CLI smoke run.

## Standing rules

These are not negotiable. A change that breaks one is wrong even if every test passes.

1. **Engine stays pure and DOM-free.** `src/engine/` imports nothing from React or the DOM, so the same
   code runs in Node scripts, tests and a Web Worker. The engine tsconfig enforces DOM; the isolation
   test enforces the rest.
2. **All randomness goes through seeded streams** (`core/rng.ts`, `core/seeds.ts`). `Math.random` is
   banned in `src/engine/`. Never seed with `masterSeed + i`.
3. **Common random numbers.** Round i draws opponents from `deriveRng(seed, "crowd", i)` and game
   randomness from `deriveRng(seed, "game", i)`, freshly seeded per candidate. The candidate (seat 0)
   never consumes from those streams, so every candidate faces identical rounds. Comparisons report the
   mean per-round paired difference with its own interval.
4. **Say "best found", never "optimal"**, in code, output and docs. Search winners get re-evaluated on a
   fresh held-out seed.
5. **Keep sampling and model uncertainty separate.** An interval describes one stated crowd; changing the
   crowd is a different axis and is never folded into an interval.
6. **Every sampler or solver needs an anchor test** (exact or known answer) **plus a demonstration that
   the test fails when the code is broken on purpose.** Record the demonstration in `docs/history.md`.
7. **Statistical tolerances come from the samples** (StrategyLab's standard): 4 SE for agreement with an
   exact value, chi-square at p = 1e-4, fixed seeds. Never raise sample sizes or loosen tolerances just
   to make a test pass; never pick a seed because it passes.
8. **Copied files keep their provenance header** and change imports only. Additions go in new files.
9. Heavy tests go in `*.stats.test.ts`, never behind a per-test timeout.

## Real and verified

As of 2026-11-15 (session 2, branch `search-and-crowds`, not merged). `npm run build` clean end to
end; `npm test` 177 tests in 19 files, all passing (about 2 min, the stats project dominates). CI run
43710590416 green (test, build, evaluate and search smoke runs).

Engine core, Blotto and evaluation (session 1):

- **DOM guard:** a `document.title` reference in `src/engine/core` fails `npm run build` with TS2584.
- **Copied code:** rng and interval files are byte-identical to StrategyLab after the 3-line header;
  their tests (including the 1M-draw chi-square) pass unchanged.
- **Blotto scoring:** hand-worked tests for an 8-7 win, a 7.5-7.5 tie (0.5 each under win/lose), a
  four-player rank:9,4,2,0 tie for first (6.5 each), and an empty castle split three ways.
- **Uniform sampler:** chi-square over the 15 compositions of 4 into 3 castles, 150,000 draws: 16.05 vs
  threshold 42.92 (df 14). Normalised uniforms: 153,633. C(104,4) = 4,598,126 checked.
- **Exact anchor:** castles [1,2,3], 6 soldiers, 2p winlose, 3p winlose, 3p rank:5,2,0, five allocations
  each, 20,000 rounds: all |z| < 4 (max 2.28); 14 of 15 95% intervals contain the exact value. Coverage
  over 200 seeds at 200 rounds: 95.5% (2p) and 93.0% (3p).
- **Determinism and CRN:** same seed gives deep-equal results; `comparePaired` sides equal `evaluate`;
  an allocation vs itself differs by exactly 0. Paired width / independent width: 0.169 (2p neighbours),
  0.245 (4p neighbours).
- **Mutation demos:** ties to the lowest index fails 4 tests; normalised-uniform sampler fails 19
  (uniformity, all 15 anchors, both coverage tests, draw count). Both reverted, suite green.
- **CLI:** both documented commands run (100,000 rounds: 0.09 s two-player, 0.24 s four-player paired).
- **CI (session 1):** GitHub Actions run 41241306399: test and build jobs green.

Search, crowds and robustness (session 2):

- **Regression:** the session-1 evaluate CLI output is identical to main apart from the runtime line.
- **Algorithms:** search is sample-average approximation under CRN: random pool (or every choice
  when the game has at most 2,000), successive halving, hill climb accepting equal-or-better moves,
  final ranking of the best 16 choices met, winner re-evaluated on `deriveSeed(seed, "holdout", 0)`.
  Crowds are i.i.d. per opponent seat. Level k is a point mass on the best found response to k-1.
  Details and reasons: ARCHITECTURE §5, §7, §8.
- **Search vs brute force:** point crowds 108 of 108 searches equal the brute-force maximum (6 games,
  3 crowds, 2 modes, 3 seeds). Uniform crowd: 82 of 82 found the brute-force argmax of the sample
  objective; 114 of 120 found an exact best, the 6 misses within 4 SE (worst exact regret 0.0033).
- **Holdout:** over 100 seeds the search estimate overstates by 0.0239 (z 10.3); held-out -0.0005 (z -0.18).
- **Crowds:** sampler chi-squares pass (mixture 14.24 vs 63.40; swapped weights 20,434). 30 cells
  against exact enumeration, max |z| 1.35, 24 of 24 intervals contain the exact value. At full size,
  SD across 30 seeds 0.00160 vs reported SE 0.00172.
- **Level-k:** Guess-2/3 (3p, raw) levels 2 and 3 equal round(4y/7) and brute force; iterated from
  100: 57, 33, 19, 11, 6, 3, 2, 1 (1 and 0 are both fixed points on the integer grid).
- **Mutation demos (all reverted):** holdout on the search seed fails 2 tests; strict-improvement
  climb fails 1; inverted ranking fails 22; unnormalised weights 8; ignored weights 8; level-k
  answering the base 4; robustness best as the minimum 3.
- **Runtime** (5 castles, 100 soldiers): search quick 0.30 s, standard 1.67 s (2p) / 2.35 s (4p),
  thorough 9 to 11 s; level-k 1..3 1.66 s; robustness 6 x 5 at 20,000 rounds 0.76 s.

## Open

- `search-and-crowds` is not merged to main.
- UI worker: wrap `search`, `buildCrowd` and `robustness` in a Web Worker with progress and cancel
  (none exists; `search` is one blocking call). Then the parameter schema for forms (session 5).
- The top is flat: over seeds 1..10 the best found 2p allocation differs every time (0-0-x-y-49
  family) while held-out payouts stay within 0.866 to 0.874. Report the payout, not the allocation,
  as the stable result.
- Levels above 1 are point masses, so under win/lose they are arbitrary among winning responses.
- Not yet built: auction and the parameter schema (5), equilibrium (6), worker, UI, report and share
  links (7-8).
- CRN does not narrow comparisons of very different allocations (the CLI pair 0-22-1-77-0 vs
  15-0-41-44-0 at 4 players: ratio 1.06). Expected, not a bug; search compares nearby allocations.
- The exact anchors share `scoreRound` with the evaluator, so they do not catch scoring bugs; the
  hand-worked scoring tests do. Keep both.
- No lint step yet (StrategyLab uses oxlint).
