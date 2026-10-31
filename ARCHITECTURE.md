# Metagame architecture

The plan for the whole project. Session numbers say when a part is due; only the parts marked
**built** exist today (CLAUDE.md "Real and verified" is the authority on what works).

## 1. What the engine answers

"Against this stated crowd, which choice scores best, and how sure are we?" Never "what is the best
strategy". Two uncertainties are reported separately, always:

- **Sampling uncertainty**: 95% intervals from the simulation (standard-error interval for a mean,
  Wilson interval for a proportion).
- **Model uncertainty**: how the answer moves when the crowd changes (crowd sweeps, robustness).

## 2. Layers

| Layer | Path | Runs in | Status |
|---|---|---|---|
| Engine: pure TypeScript, no DOM | `src/engine` | Node CLI scripts, tests, later a Web Worker via Comlink | built (core, Blotto, evaluate) |
| CLI for heavy runs | `scripts/` (run with tsx) | Node | built (`evaluate`) |
| Worker for the web UI | `src/worker` | browser worker | session 7-8 |
| Web UI | `src/` (React) | browser | placeholder page |

The engine has its own tsconfig (`tsconfig.engine.json`) whose `lib` excludes DOM and whose `types`
is empty, so any DOM use in engine code fails `npm run build`. The same code runs unchanged in a
Node script and in a worker.

## 3. Engine core (`src/engine/core`) — built

- `rng.ts`, `interval.ts`: copied from StrategyLab (header names repo, path and commit). mulberry32,
  splitmix32, `sessionSeed`, Wilson interval.
- `seeds.ts`: `deriveSeed(masterSeed, label, i)` for named streams. `meanInterval.ts`: Welford
  accumulator and the standard-error interval for a mean.
- `payout.ts`, the shared payout module every game uses: raw points, or a rank payout vector with tie
  splitting (tied players share the payouts of the ranks they jointly occupy equally). Win/lose is
  the rank vector [1, 0, ...].

## 4. Game definition

Extracted in **session 5** from two real games (Blotto and a first-price auction), not designed up
front. Blotto is written concretely until then. The definition will hold:

- parameter schema with defaults and limits;
- player count;
- validate;
- random choice;
- neighbouring choice;
- score one round from all players' choices plus a game-randomness stream;
- encode/decode for links.

A choice may be a **policy over private information**. In the auction it is a bidding rule (bid as
a function of value), not a single bid.

## 5. Crowds (session 3)

Uniform random (built, for Blotto), game-supplied heuristics, mixtures, a fixed list of choices
loaded from data, and level-k, where level k is the best found responses to level k-1, with k at
most 3.

## 6. Evaluation and common random numbers — built for Blotto

Round i draws opponents from a stream seeded by `deriveSeed(masterSeed, "crowd", i)` and game
randomness from `deriveSeed(masterSeed, "game", i)`. The candidate (seat 0) never consumes from
those streams, so every candidate faces identical rounds. Comparisons report the mean per-round
paired difference with its own interval.

CRN narrows a comparison only as far as the two candidates' per-round payouts are positively
correlated: nearby allocations gain a lot (paired interval about 0.17-0.25 of the independent
width), very different ones may gain nothing.

## 7. Search (session 2)

Random sampling plus local search (the game's neighbour move) with successive halving. The final
winner is re-evaluated on a fresh held-out seed, because the maximum of many noisy estimates is
biased upward. Results are labelled "best found", never "optimal".

## 8. Robustness (session 3)

A strategy-by-crowd matrix, regret per crowd, and the worst case across crowds.

## 9. Equilibrium (session 6, two-player zero-sum only)

Regret matching over a payoff matrix, inside double oracle, which grows the strategy set using
search as the best-response oracle. Because that oracle is approximate, exploitability is reported
as a lower bound. No equilibrium claims for three or more players.

## 10. Output (sessions 7-8)

CLI for heavy runs; worker for the web UI; settings forms generated from the parameter schema; a
one-page print report with hedged takeaways; share links carrying seed, game, params and crowd.

## 11. Correctness anchors

No sampler or solver is trusted before its anchor passes, and each anchor is shown to fail when the
code is broken on purpose.

- Small Blotto by brute-force enumeration — **built**: castles [1, 2, 3], 6 soldiers, 2 and 3
  players, exact expected payout vs Monte Carlo, plus interval coverage across 200 seeds.
- Uniform sampler — **built**: chi-square over the 15 compositions of 4 soldiers into 3 castles;
  normalised independent uniforms fail it.
- RPS equilibrium is uniform (session 6).
- Guess-2/3 level-k iterates toward 0 (session 3).
- First-price auction, n bidders, uniform values: the best response to a crowd bidding (n-1)/n of
  value is (n-1)/n (session 5).

## 12. Out of scope

Turn-based or repeated games (poker, negotiation, price wars), and any claim to predict real markets.
