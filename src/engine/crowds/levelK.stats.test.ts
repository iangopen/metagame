import { describe, expect, it } from "vitest";
import type { Game } from "../core/game";
import { RAW } from "../core/payout";
import { compareChoices } from "../eval/play";
import { blottoParams } from "../games/blotto/blotto";
import { blottoGame } from "../games/blotto/blottoGame";
import { guessGame, guessParams } from "../games/guess/guess";
import { search, SEARCH_DEFAULTS } from "../search/search";
import { exactTable, uniformPmf } from "../testing/exact";
import { pointCrowd, uniformCrowd } from "./crowd";
import { levelK, LEVEL_K_MAX } from "./levelK";

// Level-k anchor: guess 2/3 of the average. Each level of reasoning names a lower number.
//
// With raw payouts (minus the distance to the target) the best response to a crowd that all plays
// y has a closed form. Player x among n faces the target f·(x + (n − 1)·y)/n, which x hits when
// x = f·(n − 1)·y / (n − f); the distance is linear on each side of that point, so the best integer
// is the nearest one. For n = 3 and f = 2/3 that is 4y/7.

/** Brute-force best response to everyone playing `y`: the highest payout over all choices. */
function bestAgainstAll<C>(game: Game<C>, y: C): { max: number; argmax: C } {
  const seats: C[] = new Array<C>(game.players).fill(y);
  let max = -Infinity;
  let argmax = y;
  for (const c of game.enumerate()) {
    seats[0] = c;
    const v = game.score(seats, () => 0).payouts[0]!;
    if (v > max) {
      max = v;
      argmax = c;
    }
  }
  return { max, argmax };
}

describe("guess 2/3, 3 players, raw payout: level-k against brute force and the closed form", () => {
  const game = guessGame(guessParams({ payout: RAW }));
  const exact = exactTable(game, uniformPmf(game)); // 101 choices × 101² opponent profiles

  it("level 1 is within 4 SE of the exact best response to the uniform crowd; levels 2 and 3 equal round(4y/7)", () => {
    const seeds = 5;
    let level1Matches = 0;
    const chains: string[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const levels = levelK(game, uniformCrowd(game), 3, { seed });
      const [l1, l2, l3] = levels.map((l) => l.choice) as [number, number, number];
      chains.push(`${l1}→${l2}→${l3}`);

      const regret = exact.max - exact.value.get(game.encode(l1))!;
      if (regret <= 1e-12) level1Matches++;
      else {
        const se = compareChoices(game, uniformCrowd(game), exact.argmax, l1, { rounds: SEARCH_DEFAULTS.finalRounds, seed: levels[0]!.search.holdoutSeed }).diff.se;
        expect(regret / se, `seed ${seed}: level 1 is ${l1}, exact best ${exact.argmax}, regret ${regret}`).toBeLessThan(4);
      }

      for (const [below, level] of [[l1, levels[1]!], [l2, levels[2]!]] as const) {
        expect(level.search.exact).toBe(true);
        expect(level.choice).toBe(Math.round((4 * below) / 7));
        expect(level.choice).toBe(bestAgainstAll(game, below).argmax);
        expect(level.search.holdout.payout.mean).toBe(bestAgainstAll(game, below).max);
      }
      expect(l2).toBeLessThan(l1);
      expect(l3).toBeLessThan(l2);
    }
    console.log(`[level-k] guess 2/3, 3p raw: exact best response to uniform is ${exact.argmax} (expected payout ${exact.max.toFixed(4)}); level 1 matched it in ${level1Matches} of ${seeds} seeds; chains ${chains.join(", ")}`);
  });

  it("iterating the response from 100 falls to the fixed point, and every step is the brute-force best response", () => {
    // Beyond LEVEL_K_MAX the engine refuses, so the chain is extended by hand here. On the integer
    // grid with the player's own number in the average, 1 is a fixed point as well as 0
    // (round(4/7) = 1), so "toward 0" ends at 1.
    const chain = [100];
    for (let step = 0; step < 12; step++) {
      const y = chain[chain.length - 1]!;
      const r = search(game, pointCrowd(game, y), { seed: 1 + step });
      expect(r.best).toBe(bestAgainstAll(game, y).argmax);
      expect(r.best).toBe(Math.round((4 * y) / 7));
      expect(r.best).toBeLessThanOrEqual(y);
      chain.push(r.best);
    }
    console.log(`[level-k] guess 2/3, 3p raw, responses iterated from 100: ${chain.join(" → ")}`);
    expect(chain[chain.length - 1]).toBe(1);
    expect(chain.slice(0, 6)).toEqual([100, 57, 33, 19, 11, 6]);
  });
});

describe("guess 2/3, win/lose: each level names a lower number and beats the level below", () => {
  for (const players of [2, 4]) {
    it(`${players} players, 5 seeds`, () => {
      const game = guessGame(guessParams({ players }));
      const chains: string[] = [];
      for (let seed = 1; seed <= 5; seed++) {
        const levels = levelK(game, uniformCrowd(game), LEVEL_K_MAX, { seed });
        const picks = levels.map((l) => l.choice);
        chains.push(picks.join("→"));
        for (let k = 1; k < levels.length; k++) {
          const below = picks[k - 1]!;
          // Brute force says what the best payout against the level below is; search must reach it.
          expect(levels[k]!.search.holdout.payout.mean).toBe(bestAgainstAll(game, below).max);
          if (below > 0) expect(picks[k]!).toBeLessThan(below);
          else expect(picks[k]!).toBe(0); // 0 is the fixed point: nothing beats it, matching it ties
        }
      }
      console.log(`[level-k] guess 2/3, ${players}p winlose, levels 1→2→3 over uniform, seeds 1..5: ${chains.join(", ")}`);
    });
  }
});

describe("blotto level-k on a small game: each level is a brute-force best response to the one below", () => {
  it("castles 1,2,3; 10 soldiers; 3 players; raw payout; 5 seeds", () => {
    const game = blottoGame(blottoParams({ castleValues: [1, 2, 3], soldiers: 10, players: 3, payout: RAW }));
    const exact = exactTable(game, uniformPmf(game));
    const chains: string[] = [];
    for (let seed = 1; seed <= 5; seed++) {
      const levels = levelK(game, uniformCrowd(game), 3, { seed });
      chains.push(levels.map((l) => game.encode(l.choice)).join(" → "));
      const regret = exact.max - exact.value.get(game.encode(levels[0]!.choice))!;
      if (regret > 1e-12) {
        const se = compareChoices(game, uniformCrowd(game), exact.argmax, levels[0]!.choice, { rounds: SEARCH_DEFAULTS.finalRounds, seed: levels[0]!.search.holdoutSeed }).diff.se;
        expect(regret / se).toBeLessThan(4);
      }
      for (let k = 1; k < 3; k++) expect(levels[k]!.search.holdout.payout.mean).toBe(bestAgainstAll(game, levels[k - 1]!.choice).max);
    }
    console.log(`[level-k] blotto 1,2,3 / 10 soldiers / 3p raw: exact best response to uniform ${game.encode(exact.argmax)}; chains ${chains.join("; ")}`);
  });

  it("levels are capped at 3 and searched under separate seeds", () => {
    const game = blottoGame(blottoParams({ castleValues: [1, 2, 3], soldiers: 6 }));
    expect(() => levelK(game, uniformCrowd(game), 4, { seed: 1 })).toThrow("level is 4; it must be an integer from 1 to 3");
    expect(() => levelK(game, uniformCrowd(game), 0, { seed: 1 })).toThrow("level is 0");
    const levels = levelK(game, uniformCrowd(game), 2, { seed: 1 });
    expect(new Set([1, ...levels.map((l) => l.search.seed)]).size).toBe(3);
    expect(levelK(game, uniformCrowd(game), 2, { seed: 1 }).map((l) => l.choice)).toEqual(levels.map((l) => l.choice));
  });
});
