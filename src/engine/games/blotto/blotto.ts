// Colonel Blotto. Each player splits `soldiers` across the castles at once; a castle goes to the
// player who sent the most soldiers there, and tied leaders split its value equally (including a
// castle every player left empty, which all players share). Raw castle points then go through the
// shared payout module. Written concretely: the generic game definition waits for a second game.

import { applyPayout, validatePayout, WIN_LOSE, type PayoutRule } from "../../core/payout";
import type { Rng } from "../../core/rng";
import { randInt } from "../../core/seeds";

export interface BlottoParams {
  readonly castleValues: readonly number[];
  readonly soldiers: number;
  readonly players: number;
  readonly payout: PayoutRule;
}

/** One non-negative integer per castle, summing exactly to soldiers. */
export type Allocation = readonly number[];

export const BLOTTO_DEFAULTS: BlottoParams = {
  castleValues: [1, 2, 3, 4, 5],
  soldiers: 100,
  players: 2,
  payout: WIN_LOSE,
};

export const BLOTTO_LIMITS = {
  castles: { min: 2, max: 20 },
  castleValue: { min: 0, max: 1e6 }, // exclusive min: every castle is worth something
  soldiers: { min: 1, max: 10_000 },
  players: { min: 2, max: 20 },
} as const;

export function blottoParams(overrides: Partial<BlottoParams> = {}): BlottoParams {
  return { ...BLOTTO_DEFAULTS, ...overrides };
}

/** Problems with the parameters, as readable messages. Empty when valid. */
export function validateParams(p: BlottoParams): string[] {
  const L = BLOTTO_LIMITS;
  const errors: string[] = [];
  const nc = p.castleValues.length;
  if (nc < L.castles.min || nc > L.castles.max) errors.push(`there are ${nc} castles; allowed is ${L.castles.min} to ${L.castles.max}`);
  p.castleValues.forEach((v, i) => {
    if (!Number.isFinite(v) || v <= L.castleValue.min || v > L.castleValue.max) errors.push(`castle ${i + 1} has value ${v}; it must be above ${L.castleValue.min} and at most ${L.castleValue.max}`);
  });
  if (!Number.isInteger(p.soldiers) || p.soldiers < L.soldiers.min || p.soldiers > L.soldiers.max) errors.push(`soldiers is ${p.soldiers}; it must be an integer from ${L.soldiers.min} to ${L.soldiers.max}`);
  if (!Number.isInteger(p.players) || p.players < L.players.min || p.players > L.players.max) errors.push(`players is ${p.players}; it must be an integer from ${L.players.min} to ${L.players.max}`);
  errors.push(...validatePayout(p.payout, p.players));
  return errors;
}

/** Problems with an allocation under `p`, as readable messages. Empty when valid. */
export function validateAllocation(p: BlottoParams, a: Allocation): string[] {
  const errors: string[] = [];
  const nc = p.castleValues.length;
  if (a.length !== nc) errors.push(`allocation has ${a.length} counts but there are ${nc} castles`);
  a.forEach((x, i) => {
    if (!Number.isInteger(x) || x < 0) errors.push(`castle ${i + 1} gets ${x} soldiers; it must be a non-negative integer`);
  });
  const sum = a.reduce((s, x) => s + x, 0);
  if (errors.length === 0 && sum !== p.soldiers) errors.push(`allocation uses ${sum} soldiers, but soldiers is ${p.soldiers}`);
  return errors;
}

export interface RoundScore {
  /** Raw castle points per player. */
  readonly points: number[];
  /** Points after the payout rule. */
  readonly payouts: number[];
}

/**
 * Scores one round. `choices[s]` is seat s's allocation; choices are assumed valid. `_gameRng` is
 * the round's game-randomness stream: Blotto has none, but the signature keeps the stream rule.
 */
export function scoreRound(p: BlottoParams, choices: readonly Allocation[], _gameRng?: Rng): RoundScore {
  const n = choices.length;
  const points = new Array<number>(n).fill(0);
  for (let c = 0; c < p.castleValues.length; c++) {
    let max = -1;
    let leaders = 0;
    for (let s = 0; s < n; s++) {
      const x = choices[s]![c]!;
      if (x > max) {
        max = x;
        leaders = 1;
      } else if (x === max) leaders++;
    }
    const share = p.castleValues[c]! / leaders;
    for (let s = 0; s < n; s++) if (choices[s]![c] === max) points[s]! += share;
  }
  return { points, payouts: applyPayout(p.payout, points) };
}

/**
 * Uniform over all compositions of `soldiers` into `castles` non-negative parts (stars and bars):
 * choose castles − 1 distinct bar positions among soldiers + castles − 1 slots, uniformly (Floyd's
 * algorithm), and read the counts off the gaps between bars. Consumes exactly castles − 1 draws.
 * NOT normalised independent uniforms, which are not uniform over compositions.
 */
export function randomAllocation(p: BlottoParams, rng: Rng): number[] {
  const castles = p.castleValues.length;
  const k = castles - 1;
  const m = p.soldiers + k;
  const bars: number[] = [];
  for (let j = m - k; j < m; j++) {
    const t = randInt(rng, j + 1);
    bars.push(bars.includes(t) ? j : t);
  }
  bars.sort((a, b) => a - b);
  const out = new Array<number>(castles);
  let prev = -1;
  for (let c = 0; c < k; c++) {
    out[c] = bars[c]! - prev - 1;
    prev = bars[c]!;
  }
  out[k] = m - prev - 1;
  return out;
}

/** Number of allocations: C(soldiers + castles − 1, castles − 1). */
export function allocationCount(p: BlottoParams): number {
  const k = p.castleValues.length - 1;
  const m = p.soldiers + k;
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (m - k + i)) / i;
  return Math.round(c);
}

/** Every allocation, in lexicographic order. For brute-force checks on small games only. */
export function enumerateAllocations(p: BlottoParams): number[][] {
  const castles = p.castleValues.length;
  const out: number[][] = [];
  const cur = new Array<number>(castles).fill(0);
  const rec = (c: number, left: number): void => {
    if (c === castles - 1) {
      cur[c] = left;
      out.push(cur.slice());
      return;
    }
    for (let x = 0; x <= left; x++) {
      cur[c] = x;
      rec(c + 1, left - x);
    }
  };
  rec(0, p.soldiers);
  return out;
}

/**
 * Neighbouring allocation: move between 1 and all of the soldiers of a random non-empty castle to a
 * different random castle. Never returns the input unchanged. Does not mutate `a`.
 */
export function neighbour(a: Allocation, rng: Rng): number[] {
  const out = a.slice();
  const nonEmpty: number[] = [];
  for (let c = 0; c < a.length; c++) if (a[c]! > 0) nonEmpty.push(c);
  if (a.length < 2 || nonEmpty.length === 0) return out;
  const from = nonEmpty[randInt(rng, nonEmpty.length)]!;
  let to = randInt(rng, a.length - 1);
  if (to >= from) to++;
  const amount = 1 + randInt(rng, a[from]!);
  out[from]! -= amount;
  out[to]! += amount;
  return out;
}

/** Dash-separated counts, such as 15-0-41-44-0. */
export function encodeAllocation(a: Allocation): string {
  return a.join("-");
}

/** Parses dash-separated counts and validates them against `p`. Throws an Error naming the problem. */
export function decodeAllocation(p: BlottoParams, text: string): number[] {
  const parts = text.trim().split("-");
  const a = parts.map((s, i) => {
    if (!/^\d+$/.test(s)) throw new Error(`allocation "${text}": count ${i + 1} ("${s}") is not a non-negative integer`);
    return Number(s);
  });
  const errors = validateAllocation(p, a);
  if (errors.length > 0) throw new Error(`allocation "${text}": ${errors.join("; ")}`);
  return a;
}
