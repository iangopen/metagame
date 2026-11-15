// Crowds: who the candidate plays against. A crowd is a distribution over ONE opponent's choice;
// each opponent seat draws from it independently, in seat order, from the round's crowd stream.
// A crowd is model uncertainty made explicit: every result is "against this stated crowd".

import type { Game } from "../core/game";
import type { Rng } from "../core/rng";
import { randInt } from "../core/seeds";

export interface Crowd<C> {
  /** What the crowd is, in words a report can print. */
  readonly label: string;
  /** True when every draw is the same choice (a point mass). `sample` then consumes no randomness. */
  readonly deterministic: boolean;
  /** One opponent's choice. All randomness comes from `rng`. */
  sample(rng: Rng): C;
}

export const CROWD_LIMITS = { maxFixedChoices: 10_000, maxMixtureParts: 16 } as const;

function checkChoices<C>(game: Game<C>, choices: readonly C[], what: string): void {
  const errors = choices.flatMap((c, i) => game.validate(c).map((e) => `${what} ${i + 1}: ${e}`));
  if (errors.length > 0) throw new Error(errors.join("; "));
}

function checkWeights(weights: readonly number[], count: number, what: string): void {
  if (weights.length !== count) throw new Error(`${what}: ${weights.length} weights for ${count} entries`);
  weights.forEach((w, i) => {
    if (!Number.isFinite(w) || w < 0) throw new Error(`${what}: weight ${i + 1} (${w}) must be a finite number that is not negative`);
  });
  if (!(weights.reduce((a, b) => a + b, 0) > 0)) throw new Error(`${what}: the weights sum to 0`);
}

/** Index drawn with probability weights[i] / sum(weights), from one uniform draw. */
function weightedPicker(weights: readonly number[]): (rng: Rng) => number {
  const total = weights.reduce((a, b) => a + b, 0);
  const cumulative: number[] = [];
  let run = 0;
  for (const w of weights) cumulative.push((run += w / total));
  // The last entry with a positive weight catches u above the rounded cumulative sum.
  let last = weights.length - 1;
  while (weights[last] === 0) last--;
  return (rng) => {
    const u = rng();
    for (let i = 0; i < last; i++) if (u < cumulative[i]!) return i;
    return last;
  };
}

/** Every choice equally likely. */
export function uniformCrowd<C>(game: Game<C>): Crowd<C> {
  return { label: "uniform", deterministic: false, sample: (rng) => game.randomChoice(rng) };
}

/** Everyone plays `choice`. */
export function pointCrowd<C>(game: Game<C>, choice: C, label = game.encode(choice)): Crowd<C> {
  checkChoices(game, [choice], "choice");
  return { label, deterministic: true, sample: () => choice };
}

/** Everyone plays the game's named heuristic. */
export function heuristicCrowd<C>(game: Game<C>, name: string): Crowd<C> {
  if (!Object.hasOwn(game.heuristics, name)) throw new Error(`"${name}" is not a heuristic of ${game.name}; it has ${Object.keys(game.heuristics).join(", ") || "none"}`);
  return pointCrowd(game, game.heuristics[name]!, name);
}

/**
 * A fixed list of choices, such as entries loaded from data: each opponent plays one entry, drawn
 * uniformly, or with probability proportional to `weights` when given. Repeats in the list count.
 */
export function fixedCrowd<C>(game: Game<C>, choices: readonly C[], weights?: readonly number[]): Crowd<C> {
  if (choices.length === 0) throw new Error("fixed crowd: the list is empty");
  if (choices.length > CROWD_LIMITS.maxFixedChoices) throw new Error(`fixed crowd: ${choices.length} choices; the limit is ${CROWD_LIMITS.maxFixedChoices}`);
  checkChoices(game, choices, "fixed crowd choice");
  const list = choices.slice();
  const label = list.length <= 4 ? `fixed:${list.map((c) => game.encode(c)).join("/")}` : `fixed list of ${list.length} choices`;
  if (list.length === 1) return pointCrowd(game, list[0]!, label);
  if (weights === undefined) return { label, deterministic: false, sample: (rng) => list[randInt(rng, list.length)]! };
  checkWeights(weights, list.length, "fixed crowd");
  const pick = weightedPicker(weights);
  return { label: `${label} (weighted)`, deterministic: false, sample: (rng) => list[pick(rng)]! };
}

/**
 * Each opponent independently belongs to part i with probability weight_i / sum(weights), then
 * plays as that part does. One draw picks the part; the part's own draws follow on the same stream.
 */
export function mixtureCrowd<C>(parts: readonly { readonly weight: number; readonly crowd: Crowd<C> }[]): Crowd<C> {
  if (parts.length === 0) throw new Error("mixture crowd: there are no parts");
  if (parts.length > CROWD_LIMITS.maxMixtureParts) throw new Error(`mixture crowd: ${parts.length} parts; the limit is ${CROWD_LIMITS.maxMixtureParts}`);
  const weights = parts.map((p) => p.weight);
  checkWeights(weights, parts.length, "mixture crowd");
  const total = weights.reduce((a, b) => a + b, 0);
  const crowds = parts.map((p) => p.crowd);
  const pick = weightedPicker(weights);
  const label = `mix of ${parts.map((p) => `${Number(((100 * p.weight) / total).toFixed(1))}% ${p.crowd.label}`).join(", ")}`;
  return { label, deterministic: false, sample: (rng) => crowds[pick(rng)]!.sample(rng) };
}
