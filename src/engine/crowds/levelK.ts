// Level-k crowds. Level 0 is a stated base crowd (uniform unless said otherwise). Level k is a
// crowd in which everyone plays the best FOUND response to a level k − 1 crowd, so each level is a
// point mass on one searched choice. k is at most 3: deeper chains model nobody and compound the
// search error of every level below.
//
// Level j is searched under the seed deriveSeed(seed, "level", j), so the levels do not share rounds.

import type { Game } from "../core/game";
import { deriveSeed } from "../core/seeds";
import { search, type SearchOptions, type SearchResult } from "../search/search";
import { pointCrowd, type Crowd } from "./crowd";

export const LEVEL_K_MAX = 3;

export interface Level<C> {
  /** 1 .. LEVEL_K_MAX. */
  readonly level: number;
  /** What a level-`level` player plays: the best found response to the level below. */
  readonly choice: C;
  /** The crowd in which everyone is a level-`level` player. */
  readonly crowd: Crowd<C>;
  /** The search that found `choice`, including its held-out payout against the level below. */
  readonly search: SearchResult<C>;
}

/**
 * Levels 1 .. `levels` above `base`. Deterministic in its inputs. `opts.include` is offered to
 * every level's search.
 */
export function levelK<C>(game: Game<C>, base: Crowd<C>, levels: number, opts: SearchOptions<C>): Level<C>[] {
  if (!Number.isInteger(levels) || levels < 1 || levels > LEVEL_K_MAX) throw new Error(`level is ${levels}; it must be an integer from 1 to ${LEVEL_K_MAX}`);
  const out: Level<C>[] = [];
  let below = base;
  for (let level = 1; level <= levels; level++) {
    const result = search(game, below, { ...opts, seed: deriveSeed(opts.seed, "level", level) });
    const crowd = pointCrowd(game, result.best, `level ${level} over ${base.label} (plays ${game.encode(result.best)})`);
    out.push({ level, choice: result.best, crowd, search: result });
    below = crowd;
  }
  return out;
}
