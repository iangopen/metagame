// Search: the best FOUND choice against one stated crowd. Never "optimal": outside the exhaustive
// case nothing here proves that a better choice does not exist.
//
// The method is sample-average approximation. Under a fixed seed, common random numbers turn the
// noisy objective into an ordinary deterministic function: f_n(x) = mean payout of x over rounds
// 0 .. n − 1 of that seed, the same rounds for every x. Ranking by f_n is ranking by the paired
// difference, and evaluating the same x twice gives the same number, so a hill climb cannot chase
// noise. Four phases:
//
//   1. Pool.   `samples` uniform random choices plus the caller's `include`. A game with at most
//              `exhaustiveLimit` choices contributes all of them instead.
//   2. Screen. Successive halving: score the pool on `screenRounds` rounds, keep the best 1/eta,
//              multiply the rounds by eta, repeat until `starts` choices remain. Rounds go to the
//              contenders; each rung costs about the same.
//   3. Climb.  From each start, hill-climb f_n at n = climbRounds with the game's neighbour move:
//              `climbSteps` proposals, moving when the proposal is at least as good. Payouts are
//              step functions of a choice, so f_n has plateaus; moving sideways crosses them,
//              where insisting on a strict improvement gets stuck (see docs/history.md, session 2).
//   4. Final.  Take the `finalists` best choices met during the climbs (not only where each climb
//              ended, so near-ties get compared with more rounds) and rank them on `finalRounds`
//              rounds. Then re-evaluate the winner on a fresh held-out seed, because the maximum of
//              many noisy estimates is biased upward. The held-out number is the one to report.
//
// Streams: pool sample j comes from deriveRng(seed, "search-init", j); the proposals of start j
// from deriveRng(seed, "search-move", j); the held-out seed is deriveSeed(seed, "holdout", 0).
// Ties are broken by pool order, so the result is a pure function of (game, crowd, options).

import type { Game } from "../core/game";
import type { MeanInterval } from "../core/meanInterval";
import { deriveRng, deriveSeed } from "../core/seeds";
import type { Crowd } from "../crowds/crowd";
import { drawRounds, evaluateChoices, EVAL_LIMITS, meanPayoutOn, type Evaluation } from "../eval/play";

export interface SearchSettings {
  /** Uniform random choices in the starting pool. */
  readonly samples: number;
  /** Rounds at the first screening rung. */
  readonly screenRounds: number;
  /** Screening keeps the best 1/eta of the pool per rung and multiplies the rounds by eta. */
  readonly eta: number;
  /** Choices that survive screening and start a hill climb. */
  readonly starts: number;
  /** Rounds behind every hill-climb comparison. */
  readonly climbRounds: number;
  /** Neighbour proposals per start. */
  readonly climbSteps: number;
  /** How many of the best choices met during the climbs go to the final ranking. */
  readonly finalists: number;
  /** Rounds for the final ranking. */
  readonly finalRounds: number;
  /** Rounds for the held-out re-evaluation of the winner and the runner-up. */
  readonly holdoutRounds: number;
  /** A game with at most this many choices puts all of them in the pool. 0 turns this off. */
  readonly exhaustiveLimit: number;
}

export const SEARCH_DEFAULTS: SearchSettings = {
  samples: 256,
  screenRounds: 250,
  eta: 2,
  starts: 8,
  climbRounds: 2000,
  climbSteps: 200,
  finalists: 16,
  finalRounds: 20_000,
  holdoutRounds: 20_000,
  exhaustiveLimit: 2000,
};

/** Smaller and larger budgets for a UI to offer. `standard` is SEARCH_DEFAULTS. */
export const SEARCH_PRESETS: Readonly<Record<"quick" | "standard" | "thorough", SearchSettings>> = {
  quick: { ...SEARCH_DEFAULTS, samples: 96, starts: 4, climbRounds: 1000, climbSteps: 100, finalists: 8, finalRounds: 5000, holdoutRounds: 5000 },
  standard: SEARCH_DEFAULTS,
  thorough: { ...SEARCH_DEFAULTS, samples: 1024, starts: 16, climbRounds: 4000, climbSteps: 400, finalists: 32, finalRounds: 50_000, holdoutRounds: 50_000 },
};

export const SEARCH_LIMITS = {
  samples: { min: 0, max: 100_000 },
  eta: { min: 2, max: 16 },
  starts: { min: 1, max: 256 },
  climbSteps: { min: 0, max: 100_000 },
  finalists: { min: 1, max: 1024 },
  climbRounds: { min: EVAL_LIMITS.minRounds, max: 200_000 }, // the climb holds its rounds in memory
  exhaustiveLimit: { min: 0, max: 100_000 },
} as const;

export interface SearchOptions<C> extends Partial<SearchSettings> {
  /** Master seed, a uint32. */
  readonly seed: number;
  /** Choices to put in the pool ahead of the random ones: heuristics, a person's own pick. */
  readonly include?: readonly C[];
}

export interface Finalist<C> {
  readonly choice: C;
  /** Mean payout on the search seed at finalRounds. Biased upward for the top finalist. */
  readonly search: MeanInterval;
}

export interface SearchResult<C> {
  /** The best found choice. */
  readonly best: C;
  /** The winner on the rounds that selected it: biased upward. For diagnostics, not for reporting. */
  readonly searchEstimate: MeanInterval;
  /** The winner on a fresh held-out seed: the number to report, with sampling uncertainty only. */
  readonly holdout: Evaluation;
  /** The second finalist, on the same held-out rounds, when there is one. */
  readonly runnerUp: { readonly choice: C; readonly holdout: Evaluation; /** best − runner-up, paired on the held-out rounds. */ readonly diff: MeanInterval } | null;
  /** The choices that reached the final ranking, best first by the search estimate. */
  readonly finalists: Finalist<C>[];
  /** True when the pool held every choice of the game. */
  readonly exhaustive: boolean;
  /**
   * True when the crowd is a point mass and the game has no chance moves: every round is the same
   * round, so all phases run on the minimum number of rounds and every estimate is exact.
   */
  readonly exact: boolean;
  readonly poolSize: number;
  /** Distinct choices scored at least once. */
  readonly choicesSeen: number;
  /** Total single-round scorings: the cost measure. */
  readonly scorings: number;
  readonly holdoutSeed: number;
  readonly settings: SearchSettings;
  readonly seed: number;
}

function resolveSettings<C>(opts: SearchOptions<C>): SearchSettings {
  const s: SearchSettings = {
    samples: opts.samples ?? SEARCH_DEFAULTS.samples,
    screenRounds: opts.screenRounds ?? SEARCH_DEFAULTS.screenRounds,
    eta: opts.eta ?? SEARCH_DEFAULTS.eta,
    starts: opts.starts ?? SEARCH_DEFAULTS.starts,
    climbRounds: opts.climbRounds ?? SEARCH_DEFAULTS.climbRounds,
    climbSteps: opts.climbSteps ?? SEARCH_DEFAULTS.climbSteps,
    finalists: opts.finalists ?? SEARCH_DEFAULTS.finalists,
    finalRounds: opts.finalRounds ?? SEARCH_DEFAULTS.finalRounds,
    holdoutRounds: opts.holdoutRounds ?? SEARCH_DEFAULTS.holdoutRounds,
    exhaustiveLimit: opts.exhaustiveLimit ?? SEARCH_DEFAULTS.exhaustiveLimit,
  };
  const errors: string[] = [];
  const int = (name: keyof SearchSettings, min: number, max: number): void => {
    const v = s[name];
    if (!Number.isInteger(v) || v < min || v > max) errors.push(`${name} is ${v}; it must be an integer from ${min} to ${max}`);
  };
  const L = SEARCH_LIMITS;
  int("samples", L.samples.min, L.samples.max);
  int("eta", L.eta.min, L.eta.max);
  int("starts", L.starts.min, L.starts.max);
  int("climbSteps", L.climbSteps.min, L.climbSteps.max);
  int("finalists", L.finalists.min, L.finalists.max);
  int("climbRounds", L.climbRounds.min, L.climbRounds.max);
  int("screenRounds", EVAL_LIMITS.minRounds, EVAL_LIMITS.maxRounds);
  int("finalRounds", EVAL_LIMITS.minRounds, EVAL_LIMITS.maxRounds);
  int("holdoutRounds", EVAL_LIMITS.minRounds, EVAL_LIMITS.maxRounds);
  int("exhaustiveLimit", L.exhaustiveLimit.min, L.exhaustiveLimit.max);
  if (!Number.isInteger(opts.seed) || opts.seed < 0 || opts.seed > 0xffffffff) errors.push(`seed is ${opts.seed}; it must be an integer from 0 to 4294967295`);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return s;
}

/** Indices of `means` from best to worst; equal means keep their original order. */
function rank(means: readonly number[]): number[] {
  return means.map((_, i) => i).sort((a, b) => means[b]! - means[a]! || a - b);
}

/** The best found choice against `crowd`, re-evaluated on a held-out seed. Deterministic in its inputs. */
export function search<C>(game: Game<C>, crowd: Crowd<C>, opts: SearchOptions<C>): SearchResult<C> {
  const requested = resolveSettings(opts);
  const seed = opts.seed;
  // A point-mass crowd in a game without chance repeats one round: more rounds add nothing.
  const exact = crowd.deterministic && !game.hasChance;
  const min = EVAL_LIMITS.minRounds;
  const s: SearchSettings = exact ? { ...requested, screenRounds: min, climbRounds: min, finalRounds: min, holdoutRounds: min } : requested;
  let scorings = 0;

  // 1. Pool, without repeats, in a fixed order.
  const include = opts.include ?? [];
  const includeErrors = include.flatMap((c, i) => game.validate(c).map((e) => `include ${i + 1}: ${e}`));
  if (includeErrors.length > 0) throw new Error(includeErrors.join("; "));
  const exhaustive = game.choiceCount <= s.exhaustiveLimit;
  const seen = new Set<string>();
  let pool: C[] = [];
  const add = (c: C): void => {
    const key = game.encode(c);
    if (!seen.has(key)) {
      seen.add(key);
      pool.push(c);
    }
  };
  include.forEach(add);
  if (exhaustive) game.enumerate().forEach(add);
  else for (let j = 0; j < s.samples; j++) add(game.randomChoice(deriveRng(seed, "search-init", j)));
  if (pool.length === 0) throw new Error("search: the pool is empty; give samples above 0 or some include choices");
  const poolSize = pool.length;

  // 2. Screen by successive halving, never past climbRounds.
  let rounds = Math.min(s.screenRounds, s.climbRounds);
  while (pool.length > s.starts) {
    const means = evaluateChoices(game, crowd, pool, { rounds, seed }).evaluations.map((e) => e.payout.mean);
    scorings += pool.length * rounds;
    // At climbRounds a further rung would rank the same numbers again, so cut straight to `starts`.
    const keep = rounds >= s.climbRounds ? s.starts : Math.max(s.starts, Math.ceil(pool.length / s.eta));
    pool = rank(means)
      .slice(0, keep)
      .map((i) => pool[i]!);
    rounds = Math.min(rounds * s.eta, s.climbRounds);
  }

  // 3. Hill-climb each start on one fixed set of rounds. `value` remembers f_n for every choice met.
  const set = drawRounds(game, crowd, { rounds: s.climbRounds, seed });
  const value = new Map<string, number>();
  const met = new Map<string, C>(); // in the order first met, which breaks ties
  const f = (c: C): number => {
    const key = game.encode(c);
    let v = value.get(key);
    if (v === undefined) {
      v = meanPayoutOn(game, set, c);
      scorings += s.climbRounds;
      value.set(key, v);
      met.set(key, c);
      seen.add(key);
    }
    return v;
  };
  pool.forEach((start, j) => {
    let current = start;
    let currentValue = f(current);
    const moves = deriveRng(seed, "search-move", j);
    for (let step = 0; step < s.climbSteps; step++) {
      const proposal = game.neighbour(current, moves);
      const v = f(proposal);
      if (v >= currentValue) {
        current = proposal;
        currentValue = v;
      }
    }
  });

  // 4. Rank the best choices met on the search seed, then go to the held-out seed.
  const metChoices = [...met.values()];
  const shortlist = rank(metChoices.map((c) => value.get(game.encode(c))!))
    .slice(0, s.finalists)
    .map((i) => metChoices[i]!);
  const final = evaluateChoices(game, crowd, shortlist, { rounds: s.finalRounds, seed });
  scorings += shortlist.length * s.finalRounds;
  const order = rank(final.evaluations.map((e) => e.payout.mean));
  const finalists: Finalist<C>[] = order.map((i) => ({ choice: shortlist[i]!, search: final.evaluations[i]!.payout }));
  const best = finalists[0]!.choice;

  const holdoutSeed = deriveSeed(seed, "holdout", 0);
  const heldOut = finalists.length > 1 ? [best, finalists[1]!.choice] : [best];
  const h = evaluateChoices(game, crowd, heldOut, { rounds: s.holdoutRounds, seed: holdoutSeed }, heldOut.length - 1);
  scorings += heldOut.length * s.holdoutRounds;

  return {
    best,
    searchEstimate: finalists[0]!.search,
    holdout: h.evaluations[0]!,
    runnerUp: finalists.length > 1 ? { choice: finalists[1]!.choice, holdout: h.evaluations[1]!, diff: h.diffs![0]! } : null,
    finalists,
    exhaustive,
    exact,
    poolSize,
    choicesSeen: seen.size,
    scorings,
    holdoutSeed,
    settings: s,
    seed,
  };
}
