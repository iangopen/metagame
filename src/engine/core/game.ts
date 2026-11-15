// What evaluation, search and crowds need from a game, and nothing more. Drawn from the two games
// that exist (Colonel Blotto and Guess-2/3). The parameter schema with defaults and limits, and
// policies over private information, join in the session that adds the auction (ARCHITECTURE §4).

import type { Rng } from "./rng";

export interface RoundScore {
  /** Raw points per player. */
  readonly points: number[];
  /** Points after the payout rule. */
  readonly payouts: number[];
}

/** A one-shot simultaneous-move game with its parameters already bound. C is one player's choice. */
export interface Game<C> {
  /** Short name with the parameters that matter, for labels and logs. */
  readonly name: string;
  readonly players: number;
  /** True when `score` reads the game-randomness stream. Blotto and Guess-2/3 have no chance moves. */
  readonly hasChance: boolean;
  /** Number of distinct choices. May be far too large to enumerate. */
  readonly choiceCount: number;
  /** Every choice, in a fixed order. Only for small games: check `choiceCount` first. */
  enumerate(): C[];
  /** Problems with a choice, as readable messages. Empty when valid. */
  validate(choice: C): string[];
  /** Uniform over all choices. */
  randomChoice(rng: Rng): C;
  /** A nearby choice, never the input itself. Does not mutate `choice`. */
  neighbour(choice: C, rng: Rng): C;
  /** Scores one round. `choices[s]` is seat s's choice; choices are assumed valid. */
  score(choices: readonly C[], gameRng: Rng): RoundScore;
  /** Text form, unique per choice: used in links and as the identity of a choice. */
  encode(choice: C): string;
  /** Inverse of `encode`, validating. Throws an Error naming the problem. */
  decode(text: string): C;
  /** Game-supplied named choices that a person might plausibly play (an even split, ...). */
  readonly heuristics: Readonly<Record<string, C>>;
}
