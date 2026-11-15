// Colonel Blotto as a Game: binds the parameters and adds the named heuristics. The rules stay in
// blotto.ts.

import type { Game } from "../../core/game";
import { formatPayout } from "../../core/payout";
import {
  allocationCount,
  decodeAllocation,
  encodeAllocation,
  enumerateAllocations,
  neighbour,
  randomAllocation,
  scoreRound,
  validateAllocation,
  validateParams,
  type Allocation,
  type BlottoParams,
} from "./blotto";

/**
 * Splits `soldiers` in proportion to `weights` (largest remainder). Leftover soldiers go to the
 * largest fractional parts; equal fractions go to the more valuable castle, then the lower index.
 */
export function proportionalAllocation(p: BlottoParams, weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (p.soldiers * w) / total);
  const out = raw.map(Math.floor);
  let left = p.soldiers - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ frac: x - Math.floor(x), i }))
    .sort((a, b) => (Math.abs(b.frac - a.frac) > 1e-9 ? b.frac - a.frac : p.castleValues[b.i]! - p.castleValues[a.i]! || a.i - b.i));
  for (const { i } of order) {
    if (left-- <= 0) break;
    out[i]!++;
  }
  return out;
}

/**
 * The named Blotto heuristics: `even` sends the same number to every castle, `proportional` sends
 * soldiers in proportion to castle value.
 */
export function blottoHeuristics(p: BlottoParams): Record<string, Allocation> {
  return {
    even: proportionalAllocation(p, p.castleValues.map(() => 1)),
    proportional: proportionalAllocation(p, p.castleValues),
  };
}

/** Throws an Error naming the problem when the parameters are invalid. */
export function blottoGame(p: BlottoParams): Game<Allocation> {
  const errors = validateParams(p);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return {
    name: `blotto(castles ${p.castleValues.join(",")}; ${p.soldiers} soldiers; ${p.players} players; ${formatPayout(p.payout)})`,
    players: p.players,
    hasChance: false,
    choiceCount: allocationCount(p),
    enumerate: () => enumerateAllocations(p),
    validate: (a) => validateAllocation(p, a),
    randomChoice: (rng) => randomAllocation(p, rng),
    neighbour,
    score: (choices, gameRng) => scoreRound(p, choices, gameRng),
    encode: encodeAllocation,
    decode: (text) => decodeAllocation(p, text),
    heuristics: blottoHeuristics(p),
  };
}
