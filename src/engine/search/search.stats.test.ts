import { describe, expect, it } from "vitest";
import type { Game } from "../core/game";
import { parsePayout, RAW } from "../core/payout";
import { pointCrowd, uniformCrowd } from "../crowds/crowd";
import { compareChoices, evaluateChoices } from "../eval/play";
import { blottoParams } from "../games/blotto/blotto";
import { blottoGame } from "../games/blotto/blottoGame";
import { guessGame, guessParams } from "../games/guess/guess";
import { exactTable, uniformPmf, type ExactTable } from "../testing/exact";
import { search, SEARCH_DEFAULTS, type SearchOptions } from "./search";

// Search against brute force on games small enough to enumerate. Three different questions:
//
//   A. Point crowds. Every round is the same round, so there is no sampling noise at all and the
//      best found payout must EQUAL the brute-force maximum.
//   B. Uniform crowd, the optimiser alone. Search maximises the sample objective f_n (mean payout
//      over the rounds of its seed). Brute force scores every choice on those same rounds; the
//      best found must have the highest f_n. This separates optimiser error from sampling error.
//   C. Uniform crowd, against the exact expected payout. Sampling noise is now in play: two
//      choices closer than the noise cannot be told apart by any method at this budget. The best
//      found must be within 4 SE (paired, from the samples) of the exact best; where the exact gap
//      is wide, that forces an exact match.
//
// Each is run with the pool holding every choice ("exhaustive") and with the enumeration switched
// off and a pool of 32 random choices ("sampled"), so the screen-and-climb path is tested too.
// Seeds are 1, 2, 3, ... throughout. Nothing here is guaranteed in general (hence "best found");
// these are the measured anchors.

interface Case<C> {
  readonly name: string;
  readonly game: Game<C>;
  readonly targets: readonly C[];
}

function blottoCase(name: string, overrides: Parameters<typeof blottoParams>[0]): Case<readonly number[]> {
  const game = blottoGame(blottoParams(overrides));
  const all = game.enumerate();
  return { name, game, targets: [all[3]!, all[Math.floor(all.length / 2)]!, game.heuristics.proportional!] };
}

const S6_2P = blottoCase("castles 1,2,3; 6 soldiers; 2p winlose (28 choices)", { castleValues: [1, 2, 3], soldiers: 6 });
const S6_3P = blottoCase("castles 1,2,3; 6 soldiers; 3p rank:5,2,0 (28 choices)", { castleValues: [1, 2, 3], soldiers: 6, players: 3, payout: parsePayout("rank:5,2,0") });
const S10_3P = blottoCase("castles 1,2,3; 10 soldiers; 3p winlose (66 choices)", { castleValues: [1, 2, 3], soldiers: 10, players: 3 });
const S12_RAW = blottoCase("castles 1,2,3,4; 12 soldiers; 2p raw (455 choices)", { castleValues: [1, 2, 3, 4], soldiers: 12, payout: RAW });
const S12_WL = blottoCase("castles 1,2,3,4; 12 soldiers; 2p winlose (455 choices)", { castleValues: [1, 2, 3, 4], soldiers: 12 });
const BLOTTO_CASES = [S6_2P, S6_3P, S10_3P, S12_RAW, S12_WL];
const GUESS: Case<number> = { name: "guess 2/3; 3 players; raw (101 choices)", game: guessGame(guessParams({ payout: RAW })), targets: [20, 50, 90] };

const MODES: { name: string; opts: Partial<SearchOptions<never>> }[] = [
  { name: "exhaustive", opts: {} },
  { name: "sampled", opts: { exhaustiveLimit: 0, samples: 32 } },
];

describe("A. point crowds: the best found payout equals the brute-force maximum", () => {
  const run = <C>({ name, game, targets }: Case<C>): void => {
    it(name, () => {
      let searches = 0;
      for (const target of targets) {
        const seats: C[] = new Array<C>(game.players).fill(target);
        let max = -Infinity;
        for (const c of game.enumerate()) {
          seats[0] = c;
          max = Math.max(max, game.score(seats, () => 0).payouts[0]!);
        }
        for (const mode of MODES) {
          for (let seed = 1; seed <= 3; seed++) {
            const r = search(game, pointCrowd(game, target), { seed, ...mode.opts });
            searches++;
            expect(r.exact).toBe(true);
            expect(r.exhaustive).toBe(mode.name === "exhaustive");
            expect(r.holdout.payout.mean, `${mode.name}, seed ${seed}, everyone on ${game.encode(target)}: found ${game.encode(r.best)}`).toBe(max);
          }
        }
      }
      console.log(`[search A] ${name}: ${searches} of ${searches} searches equal the brute-force maximum (3 point crowds × 2 modes × 3 seeds)`);
    });
  };
  BLOTTO_CASES.forEach(run);
  run(GUESS);
});

describe("B. uniform crowd: the best found has the highest sample objective of every choice", () => {
  const run = <C>({ name, game }: Case<C>, seeds: number): void => {
    it(`${name}, ${seeds} seeds`, () => {
      const all = game.enumerate();
      let searches = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        const means = evaluateChoices(game, uniformCrowd(game), all, { rounds: SEARCH_DEFAULTS.finalRounds, seed }).evaluations.map((e) => e.payout.mean);
        const top = Math.max(...means);
        for (const mode of MODES) {
          const r = search(game, uniformCrowd(game), { seed, ...mode.opts });
          searches++;
          expect(r.searchEstimate.mean, `${mode.name}, seed ${seed}: found ${game.encode(r.best)}, brute force ${game.encode(all[means.indexOf(top)]!)}`).toBe(top);
        }
      }
      console.log(`[search B] ${name}: ${searches} of ${searches} searches found the brute-force argmax of the sample objective (${seeds} seeds × 2 modes, ${SEARCH_DEFAULTS.finalRounds} rounds)`);
    });
  };
  run(S6_2P, 10);
  run(S6_3P, 10);
  run(S10_3P, 10);
  run(S12_RAW, 3);
  run(S12_WL, 3);
  run(GUESS, 5);
});

describe("C. uniform crowd: the best found is within 4 SE of the exact best", () => {
  const run = <C>({ name, game }: Case<C>, seeds: number): void => {
    it(`${name}, ${seeds} seeds`, () => {
      const exact: ExactTable<C> = exactTable(game, uniformPmf(game));
      const sorted = [...exact.value.values()].sort((a, b) => b - a);
      let searches = 0;
      let matches = 0;
      let worst = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        for (const mode of MODES) {
          const r = search(game, uniformCrowd(game), { seed, ...mode.opts });
          searches++;
          const regret = exact.max - exact.value.get(game.encode(r.best))!;
          worst = Math.max(worst, regret);
          if (regret <= 1e-12) {
            matches++; // an exact best (ties in exact value count: 0-1-5 and 0-2-4 tie in the first case)
            continue;
          }
          const se = compareChoices(game, uniformCrowd(game), exact.argmax, r.best, { rounds: SEARCH_DEFAULTS.finalRounds, seed: r.holdoutSeed }).diff.se;
          expect(regret / se, `${mode.name}, seed ${seed}: found ${game.encode(r.best)} with exact regret ${regret}`).toBeLessThan(4);
        }
      }
      console.log(`[search C] ${name}: ${matches} of ${searches} searches found an exact best; worst exact regret ${worst.toFixed(5)}; exact gap from best to next distinct value ${(sorted[0]! - sorted.find((v) => sorted[0]! - v > 1e-12)!).toFixed(5)}`);
    });
  };
  run(S6_2P, 10);
  run(S6_3P, 10);
  run(S10_3P, 10);
  run(S12_RAW, 10);
  run(S12_WL, 10);
  run(GUESS, 10);
});

describe("the held-out estimate is unbiased; the search estimate is biased upward", () => {
  it("castles 1,2,3,4; 12 soldiers; 2p winlose; 100 seeds at 200 rounds", () => {
    // At 200 rounds the standard error (about 0.03) is wider than the exact gaps among the top
    // dozens of choices, so the maximum of the noisy estimates overstates the winner. The held-out
    // seed is what makes the reported number honest. (At 2,000 rounds only three or four choices
    // are within the noise and the bias, +0.0025, is too small for 100 seeds to show at 4 SE.)
    const { game } = S12_WL;
    const exact = exactTable(game, uniformPmf(game));
    const seeds = 100;
    const searchError: number[] = [];
    const holdoutError: number[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const r = search(game, uniformCrowd(game), { seed, screenRounds: 100, climbRounds: 200, finalRounds: 200, holdoutRounds: 200 });
      const truth = exact.value.get(game.encode(r.best))!;
      searchError.push(r.searchEstimate.mean - truth);
      holdoutError.push(r.holdout.payout.mean - truth);
    }
    const z = (xs: number[]): { mean: number; z: number } => {
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1));
      return { mean, z: mean / (sd / Math.sqrt(xs.length)) };
    };
    const s = z(searchError);
    const h = z(holdoutError);
    console.log(`[search holdout] estimate minus exact value of the best found, mean over ${seeds} seeds: search estimate ${s.mean.toFixed(5)} (z ${s.z.toFixed(2)}), held-out ${h.mean.toFixed(5)} (z ${h.z.toFixed(2)})`);
    expect(Math.abs(h.z)).toBeLessThan(4);
    expect(s.z).toBeGreaterThan(4);
  });
});
