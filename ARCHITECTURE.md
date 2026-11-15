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
| Engine: pure TypeScript, no DOM | `src/engine` | Node CLI scripts, tests, later a Web Worker via Comlink | built (core, Blotto, Guess-2/3, evaluate, crowds, search, robustness) |
| CLI for heavy runs | `scripts/` (run with tsx) | Node | built (`evaluate`, `search`) |
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

`core/game.ts` holds `Game<C>` — **built**, as the subset that evaluation, search and crowds need,
drawn from the two games that exist (Blotto and Guess-2/3): player count, `hasChance`, choice count
and enumeration, validate, random choice, neighbouring choice, score one round from all players'
choices plus a game-randomness stream, encode/decode, and named heuristics. Parameters are bound
when the game is made (`blottoGame(params)`).

Still to come in **session 5**, with the first-price auction: the parameter schema with defaults
and limits (settings forms are generated from it), and choices that are a **policy over private
information**. In the auction a choice is a bidding rule (bid as a function of value), not a single
bid.

## 5. Crowds — built

A crowd is a distribution over one opponent's choice; every opponent seat draws from it
independently from the round's crowd stream (`crowds/crowd.ts`). Kinds: uniform random,
game-supplied heuristics, a fixed list of choices (optionally weighted, for entries loaded from
data), mixtures, and level-k, where level k is a point mass on the best found response to level
k-1, with k at most 3 (`crowds/levelK.ts`). `CrowdSpec` (`crowds/spec.ts`) is the plain-data form
for links and forms, with a text syntax; `buildCrowd` turns it into a crowd and runs the level-k
searches.

A level above 1 answers a single choice, so it is brittle by construction: under win/lose many
responses win outright and the level is whichever the search met first. Use levels as parts of a
mixture, not as a prediction of what people play.

## 6. Evaluation and common random numbers — built

Round i draws opponents from a stream seeded by `deriveSeed(masterSeed, "crowd", i)` and game
randomness from `deriveSeed(masterSeed, "game", i)`. The candidate (seat 0) never consumes from
those streams, so every candidate faces identical rounds. Comparisons report the mean per-round
paired difference with its own interval.

CRN narrows a comparison only as far as the two candidates' per-round payouts are positively
correlated: nearby allocations gain a lot (paired interval about 0.17-0.25 of the independent
width), very different ones may gain nothing.

## 7. Search — built

`search(game, crowd, options)` in `search/search.ts`. The method is sample-average approximation:
under a fixed seed, common random numbers make the objective an ordinary deterministic function,
f_n(x) = mean payout of x over rounds 0 .. n-1, the same rounds for every x. Four phases:

1. **Pool**: uniform random choices plus any the caller includes. A game with at most
   `exhaustiveLimit` choices (2,000) contributes all of them.
2. **Screen**: successive halving. Score the pool on a few rounds, keep the best half, double the
   rounds, repeat until `starts` remain. Each rung costs about the same.
3. **Climb**: from each start, hill-climb f_n with the game's neighbour move, accepting a proposal
   that is at least as good. Sideways moves matter: payouts are step functions of a choice, so f_n
   has plateaus, and a strict-improvement rule gets stuck on them.
4. **Final**: rank the best choices met during the climbs on the full rounds, then re-evaluate the
   winner and the runner-up on a fresh held-out seed, because the maximum of many noisy estimates
   is biased upward. The held-out number is the result.

Why this method: it is deterministic in (game, crowd, options); a hill climb on a fixed sample
cannot chase noise, since the same choice always scores the same; ranking by f_n is ranking by the
paired difference, so CRN does its work without extra code; the cost is counted in round scorings
and bounded by the settings. What it does not give: any proof that a better choice does not exist.
Results are labelled "best found", never "optimal".

Against a point-mass crowd in a game without chance every round is the same round, so the search
runs on the minimum number of rounds and its numbers are exact.

Budgets (`SEARCH_PRESETS`): quick, standard, thorough: about 0.5, 3 and 15 million round scorings.

## 8. Robustness — built

`robustness(game, strategies, crowds, options)` in `robust/robustness.ts`: a strategy-by-crowd
matrix where every cell has its own sampling interval, regret per crowd as a paired difference
against the best listed strategy, and per strategy the worst case and the largest regret across
crowds. The summaries point at cells; crowds are never folded into one interval.

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
- Crowd samplers — **built**: chi-square of each sampler against a hand-written distribution, and
  Monte Carlo against exact enumeration for every crowd kind at 2 and 3 players.
- Search — **built**: on games small enough to enumerate, equal to brute force against point crowds,
  the brute-force argmax of the sample objective against the uniform crowd, and within 4 SE of the
  exact best; the held-out estimate is unbiased where the search estimate is not.
- Guess-2/3 level-k — **built**: each level is the brute-force best response to the one below and
  matches the closed form 4y/7 (3 players, raw payout); iterated, the responses fall to the fixed
  point (1 on the integer grid, where 0 and 1 are both fixed points).
- RPS equilibrium is uniform (session 6).
- First-price auction, n bidders, uniform values: the best response to a crowd bidding (n-1)/n of
  value is (n-1)/n (session 5).

## 12. Out of scope

Turn-based or repeated games (poker, negotiation, price wars), and any claim to predict real markets.
