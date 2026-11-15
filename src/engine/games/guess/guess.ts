// Guess a fraction of the average ("guess 2/3"). Every player names an integer from 0 to `max`; the
// target is `factor` times the mean of ALL the numbers named, the candidate's included. Raw points
// are minus the distance to the target, so closer is better; the shared payout module turns them
// into win/lose or rank payouts. Here as the level-k anchor: each level of reasoning lowers the
// number, toward 0.

import type { Game, RoundScore } from "../../core/game";
import { applyPayout, formatPayout, validatePayout, WIN_LOSE, type PayoutRule } from "../../core/payout";
import type { Rng } from "../../core/rng";
import { randInt } from "../../core/seeds";

export interface GuessParams {
  readonly players: number;
  /** Largest number a player may name. */
  readonly max: number;
  /** The target is this fraction of the mean. Strictly between 0 and 1. */
  readonly factor: number;
  readonly payout: PayoutRule;
}

export const GUESS_DEFAULTS: GuessParams = { players: 3, max: 100, factor: 2 / 3, payout: WIN_LOSE };

export const GUESS_LIMITS = { players: { min: 2, max: 20 }, max: { min: 1, max: 10_000 }, neighbourStep: 10 } as const;

export function guessParams(overrides: Partial<GuessParams> = {}): GuessParams {
  return { ...GUESS_DEFAULTS, ...overrides };
}

export function validateGuessParams(p: GuessParams): string[] {
  const L = GUESS_LIMITS;
  const errors: string[] = [];
  if (!Number.isInteger(p.players) || p.players < L.players.min || p.players > L.players.max) errors.push(`players is ${p.players}; it must be an integer from ${L.players.min} to ${L.players.max}`);
  if (!Number.isInteger(p.max) || p.max < L.max.min || p.max > L.max.max) errors.push(`max is ${p.max}; it must be an integer from ${L.max.min} to ${L.max.max}`);
  if (!(p.factor > 0 && p.factor < 1)) errors.push(`factor is ${p.factor}; it must be above 0 and below 1`);
  errors.push(...validatePayout(p.payout, p.players));
  return errors;
}

export function validateGuess(p: GuessParams, x: number): string[] {
  return Number.isInteger(x) && x >= 0 && x <= p.max ? [] : [`guess is ${x}; it must be an integer from 0 to ${p.max}`];
}

export function scoreGuessRound(p: GuessParams, choices: readonly number[]): RoundScore {
  let sum = 0;
  for (const x of choices) sum += x;
  const target = (p.factor * sum) / choices.length;
  const points = choices.map((x) => 0 - Math.abs(x - target)); // 0 − d, so a bullseye is +0
  return { points, payouts: applyPayout(p.payout, points) };
}

/** A different number within `neighbourStep` of x, uniform over those in range. */
export function guessNeighbour(p: GuessParams, x: number, rng: Rng): number {
  const low = Math.max(0, x - GUESS_LIMITS.neighbourStep);
  const high = Math.min(p.max, x + GUESS_LIMITS.neighbourStep);
  const y = low + randInt(rng, high - low); // high − low values once x itself is skipped
  return y >= x ? y + 1 : y;
}

export function decodeGuess(p: GuessParams, text: string): number {
  if (!/^\d+$/.test(text.trim())) throw new Error(`guess "${text}" is not a non-negative integer`);
  const x = Number(text.trim());
  const errors = validateGuess(p, x);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return x;
}

/** Throws an Error naming the problem when the parameters are invalid. */
export function guessGame(p: GuessParams): Game<number> {
  const errors = validateGuessParams(p);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return {
    name: `guess(${p.players} players; 0 to ${p.max}; factor ${Number(p.factor.toFixed(4))}; ${formatPayout(p.payout)})`,
    players: p.players,
    hasChance: false,
    choiceCount: p.max + 1,
    enumerate: () => Array.from({ length: p.max + 1 }, (_, x) => x),
    validate: (x) => validateGuess(p, x),
    randomChoice: (rng) => randInt(rng, p.max + 1),
    neighbour: (x, rng) => guessNeighbour(p, x, rng),
    score: (choices) => scoreGuessRound(p, choices),
    encode: (x) => String(x),
    decode: (text) => decodeGuess(p, text),
    heuristics: { middle: Math.floor(p.max / 2) },
  };
}
