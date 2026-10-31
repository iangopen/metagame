// Evaluates Blotto allocations against the uniform random crowd. Written against Blotto directly:
// generalising waits for the second game.
//
// Common random numbers: round i draws the opponents from the stream deriveRng(seed, "crowd", i)
// and the game randomness from deriveRng(seed, "game", i), freshly seeded for every candidate. The
// candidate (always seat 0) never consumes from those streams, so every candidate evaluated under
// the same seed faces identical rounds, and a paired comparison removes the crowd noise they share.

import { wilsonInterval } from "../core/interval";
import { addSample, createMeanAccumulator, meanInterval, type MeanInterval } from "../core/meanInterval";
import { isOutrightFirst } from "../core/payout";
import { deriveRng } from "../core/seeds";
import { randomAllocation, scoreRound, validateAllocation, validateParams, type Allocation, type BlottoParams } from "../games/blotto/blotto";

export const EVAL_LIMITS = { minRounds: 2, maxRounds: 10_000_000 } as const;

export interface EvaluateOptions {
  readonly rounds: number;
  /** Master seed, a uint32. */
  readonly seed: number;
}

export interface Evaluation {
  readonly rounds: number;
  /** Mean payout per round with its 95% standard-error interval. */
  readonly payout: MeanInterval;
  /** Share of rounds the candidate finished strictly first (ties excluded), with its 95% Wilson interval. */
  readonly firstPlace: { readonly count: number; readonly rate: number; readonly low: number; readonly high: number };
}

export interface PairedComparison {
  readonly a: Evaluation;
  readonly b: Evaluation;
  /** Mean per-round payout difference a − b over the same rounds, with its own 95% interval. */
  readonly diff: MeanInterval;
}

function check(p: BlottoParams, candidates: readonly Allocation[], opts: EvaluateOptions): void {
  const errors = validateParams(p);
  candidates.forEach((c, i) => errors.push(...validateAllocation(p, c).map((e) => `candidate ${i + 1}: ${e}`)));
  const { minRounds, maxRounds } = EVAL_LIMITS;
  if (!Number.isInteger(opts.rounds) || opts.rounds < minRounds || opts.rounds > maxRounds) errors.push(`rounds is ${opts.rounds}; it must be an integer from ${minRounds} to ${maxRounds}`);
  if (!Number.isInteger(opts.seed) || opts.seed < 0 || opts.seed > 0xffffffff) errors.push(`seed is ${opts.seed}; it must be an integer from 0 to 4294967295`);
  if (errors.length > 0) throw new Error(errors.join("; "));
}

/** Plays every round once per candidate (candidate in seat 0) against the same crowd draw. */
function play(p: BlottoParams, candidates: readonly Allocation[], opts: EvaluateOptions) {
  check(p, candidates, opts);
  const payouts = candidates.map(() => createMeanAccumulator());
  const firsts = candidates.map(() => 0);
  const diff = createMeanAccumulator();
  const seats: Allocation[] = new Array(p.players);
  const roundPayout = new Array<number>(candidates.length);
  for (let i = 0; i < opts.rounds; i++) {
    const crowd = deriveRng(opts.seed, "crowd", i);
    for (let s = 1; s < p.players; s++) seats[s] = randomAllocation(p, crowd);
    for (let k = 0; k < candidates.length; k++) {
      seats[0] = candidates[k]!;
      const r = scoreRound(p, seats, deriveRng(opts.seed, "game", i));
      roundPayout[k] = r.payouts[0]!;
      addSample(payouts[k]!, r.payouts[0]!);
      if (isOutrightFirst(r.points, 0)) firsts[k]!++;
    }
    if (candidates.length === 2) addSample(diff, roundPayout[0]! - roundPayout[1]!);
  }
  const evaluations: Evaluation[] = candidates.map((_, k) => {
    const w = wilsonInterval(firsts[k]!, opts.rounds);
    return { rounds: opts.rounds, payout: meanInterval(payouts[k]!), firstPlace: { count: firsts[k]!, rate: firsts[k]! / opts.rounds, low: w.low, high: w.high } };
  });
  return { evaluations, diff: meanInterval(diff) };
}

/** Mean payout and outright first-place rate of `candidate` against the uniform random crowd. */
export function evaluate(p: BlottoParams, candidate: Allocation, opts: EvaluateOptions): Evaluation {
  return play(p, [candidate], opts).evaluations[0]!;
}

/** Evaluates a and b on identical rounds and reports the paired difference a − b. */
export function comparePaired(p: BlottoParams, a: Allocation, b: Allocation, opts: EvaluateOptions): PairedComparison {
  const { evaluations, diff } = play(p, [a, b], opts);
  return { a: evaluations[0]!, b: evaluations[1]!, diff };
}
