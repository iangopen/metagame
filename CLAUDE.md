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
                   #   [--castles 1,2,3,4,5] [--soldiers 100] [--rounds 10000] [--seed 1]
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
  - `eval/evaluate.ts`: `evaluate`, `comparePaired` against the uniform crowd (Blotto-specific).
  - `isolation.test.ts`: no Math.random, React or DOM in engine sources.
- `scripts/evaluate.ts`: the CLI. `src/App.tsx`, `src/main.tsx`: placeholder page.
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

As of 2026-10-31 (session 1). `npm run build` clean; `npm test` 78 tests in 11 files, all passing.

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

## Open

- Not yet built: search (session 2), other crowds and robustness (3), auction and the extracted game
  definition (5), equilibrium (6), worker, UI, report and share links (7-8).
- CI exists but has only run when this file says so in `docs/history.md`.
- CRN does not narrow comparisons of very different allocations (the CLI pair 0-22-1-77-0 vs
  15-0-41-44-0 at 4 players: ratio 1.06). Expected, not a bug; search compares nearby allocations.
- The exact anchors share `scoreRound` with the evaluator, so they do not catch scoring bugs; the
  hand-worked scoring tests do. Keep both.
- No lint step yet (StrategyLab uses oxlint).
