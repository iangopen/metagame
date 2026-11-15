import { describe, expect, it } from "vitest";
import type { Game } from "../core/game";
import { parsePayout, type PayoutRule } from "../core/payout";
import { mulberry32 } from "../core/rng";
import { evaluateChoice } from "../eval/play";
import { blottoParams, type Allocation } from "../games/blotto/blotto";
import { blottoGame } from "../games/blotto/blottoGame";
import { chiSquareQuantile, exactPayout, uniformPmf, Z_1E4, type Pmf } from "../testing/exact";
import { fixedCrowd, heuristicCrowd, mixtureCrowd, pointCrowd, uniformCrowd, type Crowd } from "./crowd";

// Anchors for every crowd kind on castles [1, 2, 3] with 6 soldiers (28 allocations). Each crowd's
// distribution is written out by hand below, independently of the sampler, so that
//   (1) the sampler's draw frequencies can be tested against it (chi-square at p = 1e-4), and
//   (2) the expected payout against it is a finite sum, which Monte Carlo must match within 4 SE.

const SMALL = { castleValues: [1, 2, 3], soldiers: 6 } as const;
const LIST: Allocation[] = [[2, 2, 2], [1, 2, 3], [0, 3, 3], [0, 0, 6]];
const WEIGHTS = [4, 3, 2, 1];

interface Setup {
  readonly name: string;
  readonly crowd: (g: Game<Allocation>) => Crowd<Allocation>;
  readonly pmf: (g: Game<Allocation>) => Pmf<Allocation>;
}

const fixedPmf: Pmf<Allocation> = LIST.map((choice) => ({ choice, p: 1 / 4 }));
const weightedPmf: Pmf<Allocation> = LIST.map((choice, i) => ({ choice, p: WEIGHTS[i]! / 10 }));
/** 50% uniform, 30% the weighted list, 20% everyone on the proportional heuristic (1-2-3). */
function mixturePmf(g: Game<Allocation>): Pmf<Allocation> {
  return [...uniformPmf(g).map(({ choice, p }) => ({ choice, p: 0.5 * p })), ...weightedPmf.map(({ choice, p }) => ({ choice, p: 0.3 * p })), { choice: [1, 2, 3], p: 0.2 }];
}

const SETUPS: Setup[] = [
  { name: "uniform", crowd: uniformCrowd, pmf: uniformPmf },
  { name: "fixed list of 4", crowd: (g) => fixedCrowd(g, LIST), pmf: () => fixedPmf },
  { name: "weighted list 4:3:2:1", crowd: (g) => fixedCrowd(g, LIST, WEIGHTS), pmf: () => weightedPmf },
  { name: "point mass on the proportional heuristic", crowd: (g) => heuristicCrowd(g, "proportional"), pmf: () => [{ choice: [1, 2, 3], p: 1 }] },
  {
    name: "mixture 50% uniform, 30% weighted list, 20% proportional",
    crowd: (g) => mixtureCrowd([{ weight: 5, crowd: uniformCrowd(g) }, { weight: 3, crowd: fixedCrowd(g, LIST, WEIGHTS) }, { weight: 2, crowd: heuristicCrowd(g, "proportional") }]),
    pmf: mixturePmf,
  },
];

const game2 = blottoGame(blottoParams(SMALL));

/** Chi-square of `crowd`'s draws against `pmf` over the cells with positive probability. */
function chiSquare(g: Game<Allocation>, crowd: Crowd<Allocation>, pmf: Pmf<Allocation>, draws: number, seed: number): { x2: number; df: number } {
  const expected = new Map<string, number>();
  for (const { choice, p } of pmf) expected.set(g.encode(choice), (expected.get(g.encode(choice)) ?? 0) + p * draws);
  const counts = new Map<string, number>([...expected.keys()].map((k) => [k, 0]));
  const rng = mulberry32(seed);
  for (let i = 0; i < draws; i++) {
    const key = g.encode(crowd.sample(rng));
    const c = counts.get(key);
    if (c === undefined) throw new Error(`draw ${i} (${key}) has probability 0 under the stated distribution`);
    counts.set(key, c + 1);
  }
  let x2 = 0;
  for (const [key, e] of expected) x2 += (counts.get(key)! - e) ** 2 / e;
  return { x2, df: expected.size - 1 };
}

describe("crowd samplers draw from their stated distribution (chi-square, 150,000 draws, p = 1e-4)", () => {
  for (const setup of SETUPS.filter((s) => !s.name.startsWith("point"))) {
    it(setup.name, () => {
      const { x2, df } = chiSquare(game2, setup.crowd(game2), setup.pmf(game2), 150_000, 2024);
      console.log(`[crowd chi-square] ${setup.name}: chi2 = ${x2.toFixed(2)}, df = ${df}, threshold = ${chiSquareQuantile(df).toFixed(2)}`);
      expect(x2).toBeLessThan(chiSquareQuantile(df));
    });
  }

  it("the test has power: a mixture with two weights swapped fails", () => {
    const wrong = mixtureCrowd([{ weight: 3, crowd: uniformCrowd(game2) }, { weight: 5, crowd: fixedCrowd(game2, LIST, WEIGHTS) }, { weight: 2, crowd: heuristicCrowd(game2, "proportional") }]);
    const { x2, df } = chiSquare(game2, wrong, mixturePmf(game2), 150_000, 2024);
    console.log(`[crowd chi-square] swapped weights: chi2 = ${x2.toFixed(2)}, df = ${df}, threshold = ${chiSquareQuantile(df).toFixed(2)}`);
    expect(x2).toBeGreaterThan(chiSquareQuantile(df));
  });
});

const CASES: { players: number; payout: PayoutRule; text: string }[] = [
  { players: 2, payout: parsePayout("winlose"), text: "2p winlose" },
  { players: 3, payout: parsePayout("rank:5,2,0"), text: "3p rank:5,2,0" },
];
const CANDIDATES: Allocation[] = [[0, 1, 5], [2, 2, 2], [0, 3, 3]];

describe("expected payout against each crowd: Monte Carlo agrees with exact enumeration (20,000 rounds, 4 SE)", () => {
  let checked = 0;
  let maxZ = 0;
  let inside = 0;
  let sampled = 0;
  for (const { players, payout, text } of CASES) {
    const g = blottoGame(blottoParams({ ...SMALL, players, payout }));
    for (const setup of SETUPS) {
      it(`${text}, ${setup.name}`, () => {
        for (const candidate of CANDIDATES) {
          const exact = exactPayout(g, candidate, setup.pmf(g));
          const e = evaluateChoice(g, setup.crowd(g), candidate, { rounds: 20_000, seed: 11 });
          checked++;
          if (e.payout.se === 0) {
            // A point crowd: every round is the same, so the estimate is the exact value.
            expect(e.payout.mean).toBeCloseTo(exact, 12);
            continue;
          }
          const z = (e.payout.mean - exact) / e.payout.se;
          sampled++;
          maxZ = Math.max(maxZ, Math.abs(z));
          if (e.payout.low <= exact && exact <= e.payout.high) inside++;
          expect(Math.abs(z)).toBeLessThan(4);
        }
      });
    }
  }
  it("summary", () => {
    console.log(`[crowd anchor] ${checked} (crowd, players, candidate) cells checked; ${sampled} sampled cells: max |z| ${maxZ.toFixed(2)}, ${inside} of ${sampled} 95% intervals contain the exact value`);
    expect(checked).toBe(CASES.length * SETUPS.length * CANDIDATES.length);
  });
});

describe("three players face independent draws: the mixture is not a mix of whole tables", () => {
  it("3p payout against a 50/50 mixture differs from the average of the two pure-crowd payouts, and Monte Carlo sides with the exact value", () => {
    // With two opponents, one may be uniform and the other on 0-0-6. Averaging "both uniform" and
    // "both on 0-0-6" misses those rounds, so a sampler that drew one part per round would be wrong.
    const g = blottoGame(blottoParams({ ...SMALL, players: 3 }));
    const candidate = [0, 1, 5];
    const point: Pmf<Allocation> = [{ choice: [0, 0, 6], p: 1 }];
    const mix: Pmf<Allocation> = [...uniformPmf(g).map(({ choice, p }) => ({ choice, p: 0.5 * p })), { choice: [0, 0, 6], p: 0.5 }];
    const exact = exactPayout(g, candidate, mix);
    const average = 0.5 * exactPayout(g, candidate, uniformPmf(g)) + 0.5 * exactPayout(g, candidate, point);
    const e = evaluateChoice(g, mixtureCrowd([{ weight: 1, crowd: uniformCrowd(g) }, { weight: 1, crowd: pointCrowd(g, [0, 0, 6]) }]), candidate, { rounds: 20_000, seed: 11 });
    console.log(`[crowd anchor] 3p mixture: exact ${exact.toFixed(5)}, average of pure crowds ${average.toFixed(5)}, MC ${e.payout.mean.toFixed(5)} (SE ${e.payout.se.toFixed(5)})`);
    expect(Math.abs(e.payout.mean - exact) / e.payout.se).toBeLessThan(4);
    expect(Math.abs(e.payout.mean - average) / e.payout.se).toBeGreaterThan(4);
  });
});

describe("no exact answer at full size: the estimate is stable across seeds", () => {
  it("100 soldiers, castles 1..5, a mixture crowd: the spread over 30 seeds matches the reported standard error", () => {
    const g = blottoGame(blottoParams());
    const crowd = mixtureCrowd([{ weight: 5, crowd: uniformCrowd(g) }, { weight: 3, crowd: heuristicCrowd(g, "proportional") }, { weight: 2, crowd: heuristicCrowd(g, "even") }]);
    const seeds = 30;
    const means: number[] = [];
    let seSquared = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const e = evaluateChoice(g, crowd, [0, 0, 17, 34, 49], { rounds: 20_000, seed });
      means.push(e.payout.mean);
      seSquared += e.payout.se ** 2 / seeds;
    }
    const mean = means.reduce((a, b) => a + b, 0) / seeds;
    const variance = means.reduce((a, m) => a + (m - mean) ** 2, 0) / (seeds - 1);
    const ratio = ((seeds - 1) * variance) / seSquared; // chi-square with seeds − 1 df if the SE is honest
    const low = chiSquareQuantile(seeds - 1, -Z_1E4);
    const high = chiSquareQuantile(seeds - 1);
    console.log(`[crowd stability] mean over ${seeds} seeds ${mean.toFixed(5)}; min ${Math.min(...means).toFixed(5)}, max ${Math.max(...means).toFixed(5)}; SD across seeds ${Math.sqrt(variance).toFixed(5)} vs reported SE ${Math.sqrt(seSquared).toFixed(5)}; (n−1)·s²/SE² = ${ratio.toFixed(2)}, allowed ${low.toFixed(2)} to ${high.toFixed(2)}`);
    expect(ratio).toBeGreaterThan(low);
    expect(ratio).toBeLessThan(high);
  });
});
