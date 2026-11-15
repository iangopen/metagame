// Brute-force references for the anchor tests. Small games only: the cost is
// choices × support^(players − 1) scorings. Kept apart from the code under test: nothing in
// search, crowds or evaluation imports this file.

import type { Game } from "../core/game";

/** One opponent's choice distribution, written out: probabilities sum to 1. */
export type Pmf<C> = readonly { readonly choice: C; readonly p: number }[];

const NO_CHANCE = (): number => {
  throw new Error("exact enumeration does not support games with chance moves");
};

/** Exact expected seat-0 payout of `candidate` against independent opponents drawn from `pmf`. */
export function exactPayout<C>(game: Game<C>, candidate: C, pmf: Pmf<C>): number {
  const seats: C[] = new Array(game.players);
  seats[0] = candidate;
  const rec = (seat: number, prob: number): number => {
    if (seat === game.players) return prob * game.score(seats, NO_CHANCE).payouts[0]!;
    let sum = 0;
    for (const { choice, p } of pmf) {
      if (p === 0) continue;
      seats[seat] = choice;
      sum += rec(seat + 1, prob * p);
    }
    return sum;
  };
  return rec(1, 1);
}

export interface ExactTable<C> {
  /** Exact expected payout per encoded choice. */
  readonly value: ReadonlyMap<string, number>;
  /** The highest exact expected payout over every choice of the game. */
  readonly max: number;
  /** A choice attaining `max` (the first in enumeration order). */
  readonly argmax: C;
}

/** Exact expected payout of every choice of the game against `pmf`: the brute-force answer. */
export function exactTable<C>(game: Game<C>, pmf: Pmf<C>): ExactTable<C> {
  const value = new Map<string, number>();
  let max = -Infinity;
  let argmax: C | undefined;
  for (const c of game.enumerate()) {
    const v = exactPayout(game, c, pmf);
    value.set(game.encode(c), v);
    if (v > max) {
      max = v;
      argmax = c;
    }
  }
  return { value, max, argmax: argmax! };
}

/** The uniform crowd, written out. */
export function uniformPmf<C>(game: Game<C>): Pmf<C> {
  const all = game.enumerate();
  return all.map((choice) => ({ choice, p: 1 / all.length }));
}

/** Standard normal quantile for an upper tail of 1e-4. */
export const Z_1E4 = 3.719016;

/** Chi-square quantile by Wilson–Hilferty: the upper 1e-4 point by default, the lower with z = −Z_1E4. */
export function chiSquareQuantile(df: number, z = Z_1E4): number {
  const a = 2 / (9 * df);
  return df * (1 - a + z * Math.sqrt(a)) ** 3;
}
