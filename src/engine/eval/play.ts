// Evaluates choices of any game against any crowd.
//
// Common random numbers: round i draws the opponents from the stream deriveRng(seed, "crowd", i),
// one crowd.sample per opponent seat in seat order, and the game randomness from
// deriveRng(seed, "game", i), freshly seeded for every candidate. The candidate (always seat 0)
// never consumes from those streams, so every candidate evaluated under the same seed faces
// identical rounds, and a paired comparison removes the crowd noise they share.

import type { Crowd } from "../crowds/crowd";
import type { Game } from "../core/game";
import { wilsonInterval } from "../core/interval";
import { addSample, createMeanAccumulator, meanInterval, type MeanInterval } from "../core/meanInterval";
import { isOutrightFirst } from "../core/payout";
import { deriveRng } from "../core/seeds";

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

export function optionErrors(opts: EvaluateOptions): string[] {
  const errors: string[] = [];
  const { minRounds, maxRounds } = EVAL_LIMITS;
  if (!Number.isInteger(opts.rounds) || opts.rounds < minRounds || opts.rounds > maxRounds) errors.push(`rounds is ${opts.rounds}; it must be an integer from ${minRounds} to ${maxRounds}`);
  if (!Number.isInteger(opts.seed) || opts.seed < 0 || opts.seed > 0xffffffff) errors.push(`seed is ${opts.seed}; it must be an integer from 0 to 4294967295`);
  return errors;
}

function check<C>(game: Game<C>, candidates: readonly C[], opts: EvaluateOptions): void {
  const errors = candidates.flatMap((c, i) => game.validate(c).map((e) => `candidate ${i + 1}: ${e}`));
  errors.push(...optionErrors(opts));
  if (errors.length > 0) throw new Error(errors.join("; "));
}

export interface ManyEvaluations {
  readonly evaluations: Evaluation[];
  /** With `reference` set: per candidate k, the paired per-round difference payout_k − payout_reference. */
  readonly diffs: MeanInterval[] | null;
}

/**
 * Plays every round once per candidate (candidate in seat 0) against the same crowd draw. Streams
 * the rounds, so memory does not grow with `rounds`. `reference` is the index of the candidate the
 * paired differences are taken against.
 */
export function evaluateChoices<C>(game: Game<C>, crowd: Crowd<C>, candidates: readonly C[], opts: EvaluateOptions, reference?: number): ManyEvaluations {
  check(game, candidates, opts);
  const n = candidates.length;
  if (reference !== undefined && !(Number.isInteger(reference) && reference >= 0 && reference < n)) throw new Error(`reference is ${reference}; it must index one of the ${n} candidates`);
  const payouts = candidates.map(() => createMeanAccumulator());
  const diffs = reference === undefined ? null : candidates.map(() => createMeanAccumulator());
  const firsts = new Array<number>(n).fill(0);
  const seats: C[] = new Array(game.players);
  const roundPayout = new Array<number>(n);
  for (let i = 0; i < opts.rounds; i++) {
    const crowdRng = deriveRng(opts.seed, "crowd", i);
    for (let s = 1; s < game.players; s++) seats[s] = crowd.sample(crowdRng);
    for (let k = 0; k < n; k++) {
      seats[0] = candidates[k]!;
      const r = game.score(seats, deriveRng(opts.seed, "game", i));
      roundPayout[k] = r.payouts[0]!;
      addSample(payouts[k]!, r.payouts[0]!);
      if (isOutrightFirst(r.points, 0)) firsts[k]!++;
    }
    if (diffs !== null) {
      const ref = roundPayout[reference!]!;
      for (let k = 0; k < n; k++) addSample(diffs[k]!, roundPayout[k]! - ref);
    }
  }
  const evaluations: Evaluation[] = candidates.map((_, k) => {
    const w = wilsonInterval(firsts[k]!, opts.rounds);
    return { rounds: opts.rounds, payout: meanInterval(payouts[k]!), firstPlace: { count: firsts[k]!, rate: firsts[k]! / opts.rounds, low: w.low, high: w.high } };
  });
  return { evaluations, diffs: diffs === null ? null : diffs.map((d) => meanInterval(d)) };
}

/** Mean payout and outright first-place rate of `candidate` against `crowd`. */
export function evaluateChoice<C>(game: Game<C>, crowd: Crowd<C>, candidate: C, opts: EvaluateOptions): Evaluation {
  return evaluateChoices(game, crowd, [candidate], opts).evaluations[0]!;
}

/** Evaluates a and b on identical rounds and reports the paired difference a − b. */
export function compareChoices<C>(game: Game<C>, crowd: Crowd<C>, a: C, b: C, opts: EvaluateOptions): PairedComparison {
  const { evaluations, diffs } = evaluateChoices(game, crowd, [a, b], opts, 1);
  return { a: evaluations[0]!, b: evaluations[1]!, diff: diffs![0]! };
}

/** The opponents of rounds 0 .. rounds − 1 under `seed`, drawn once so many candidates can reuse them. */
export interface RoundSet<C> {
  readonly seed: number;
  /** opponents[i][s − 1] is seat s's choice in round i. */
  readonly opponents: C[][];
}

/** Draws exactly the opponents `evaluateChoices` would face. Memory grows with rounds × players. */
export function drawRounds<C>(game: Game<C>, crowd: Crowd<C>, opts: EvaluateOptions): RoundSet<C> {
  const errors = optionErrors(opts);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const opponents: C[][] = new Array(opts.rounds);
  for (let i = 0; i < opts.rounds; i++) {
    const crowdRng = deriveRng(opts.seed, "crowd", i);
    const row: C[] = new Array(game.players - 1);
    for (let s = 1; s < game.players; s++) row[s - 1] = crowd.sample(crowdRng);
    opponents[i] = row;
  }
  return { seed: opts.seed, opponents };
}

/**
 * Mean payout of `candidate` over a drawn round set: the same number, bit for bit, as
 * evaluateChoices(...).evaluations[k].payout.mean for the same seed and rounds.
 */
export function meanPayoutOn<C>(game: Game<C>, set: RoundSet<C>, candidate: C): number {
  const acc = createMeanAccumulator();
  const seats: C[] = new Array(game.players);
  seats[0] = candidate;
  for (let i = 0; i < set.opponents.length; i++) {
    const row = set.opponents[i]!;
    for (let s = 1; s < game.players; s++) seats[s] = row[s - 1]!;
    addSample(acc, game.score(seats, deriveRng(set.seed, "game", i)).payouts[0]!);
  }
  return acc.mean;
}
