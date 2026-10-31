import { describe, expect, it } from "vitest";
import { formatPayout, parsePayout, type PayoutRule } from "../core/payout";
import { BLOTTO_DEFAULTS, blottoParams, encodeAllocation, enumerateAllocations, scoreRound, type Allocation, type BlottoParams } from "../games/blotto/blotto";
import { comparePaired, evaluate } from "./evaluate";

// Exact anchor: castleValues [1, 2, 3] and 6 soldiers have 28 allocations, so the expected payout
// against the uniform crowd is a finite average over every opponent profile (28 for 2 players,
// 28^2 = 784 for 3). The Monte Carlo estimate must agree with it, and its 95% interval must cover
// the exact value about 95% of the time across seeds.

const SMALL = { castleValues: [1, 2, 3], soldiers: 6 } as const;
const ALL = enumerateAllocations(blottoParams(SMALL));

/** Exact expected seat-0 payout against independent uniform opponents, by full enumeration. */
function exactPayout(p: BlottoParams, candidate: Allocation): number {
  let sum = 0;
  let count = 0;
  const rec = (seats: Allocation[]): void => {
    if (seats.length === p.players) {
      sum += scoreRound(p, seats).payouts[0]!;
      count++;
      return;
    }
    for (const a of ALL) rec([...seats, a]);
  };
  rec([candidate]);
  return sum / count;
}

const CASES: { players: number; payout: PayoutRule }[] = [
  { players: 2, payout: parsePayout("winlose") },
  { players: 3, payout: parsePayout("winlose") },
  { players: 3, payout: parsePayout("rank:5,2,0") },
];
const ALLOCS = [[2, 2, 2], [0, 3, 3], [1, 2, 3], [0, 0, 6], [3, 3, 0]];

describe("exact anchor: castles [1, 2, 3], 6 soldiers, uniform crowd", () => {
  for (const { players, payout } of CASES) {
    const p = blottoParams({ ...SMALL, players, payout });
    for (const alloc of ALLOCS) {
      it(`${players} players, ${formatPayout(payout)}, ${encodeAllocation(alloc)}: Monte Carlo agrees with enumeration`, () => {
        const exact = exactPayout(p, alloc);
        const e = evaluate(p, alloc, { rounds: 20_000, seed: 11 });
        const z = (e.payout.mean - exact) / e.payout.se;
        const inside = e.payout.low <= exact && exact <= e.payout.high;
        console.log(`[anchor] ${players}p ${formatPayout(payout)} ${encodeAllocation(alloc)}: exact ${exact.toFixed(6)}, MC ${e.payout.mean.toFixed(6)} [${e.payout.low.toFixed(6)}, ${e.payout.high.toFixed(6)}], SE ${e.payout.se.toFixed(6)}, z ${z.toFixed(2)}, 95% interval contains exact: ${inside}`);
        // StrategyLab's standard: 4 SE, SE from the samples. 95% coverage is checked across seeds below.
        expect(Math.abs(z)).toBeLessThan(4);
      });
    }
  }
});

describe("coverage of the 95% interval across 200 seeds at 200 rounds", () => {
  const settings = [
    { players: 2, alloc: [1, 2, 3], payout: parsePayout("winlose") },
    { players: 3, alloc: [0, 3, 3], payout: parsePayout("rank:5,2,0") },
  ];
  for (const { players, alloc, payout } of settings) {
    it(`${players} players, ${encodeAllocation(alloc)}: empirical coverage is between 90% and 99%`, () => {
      const p = blottoParams({ ...SMALL, players, payout });
      const exact = exactPayout(p, alloc);
      let covered = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const e = evaluate(p, alloc, { rounds: 200, seed });
        if (e.payout.low <= exact && exact <= e.payout.high) covered++;
      }
      console.log(`[coverage] ${players}p ${encodeAllocation(alloc)}: exact ${exact.toFixed(6)}, covered ${covered}/200 = ${((covered / 200) * 100).toFixed(1)}%`);
      expect(covered / 200).toBeGreaterThanOrEqual(0.9);
      expect(covered / 200).toBeLessThanOrEqual(0.99);
    });
  }
});

// CRN narrows the paired interval only as far as the two candidates' per-round payouts are positively
// correlated. Nearby allocations (what local search compares) are strongly correlated. Very different
// allocations need not be: the CLI pair 0-22-1-77-0 vs 15-0-41-44-0 (4 players, rank:9,4,2,0) gives a
// paired width about 1.06 times the independent one, so it is not asserted here.
describe("common random numbers narrow the comparison of nearby allocations", () => {
  const P4 = blottoParams({ players: 4, payout: parsePayout("rank:9,4,2,0") });
  const cases = [
    { name: "neighbours, 2 players winlose", p: BLOTTO_DEFAULTS, a: [15, 0, 41, 44, 0], b: [16, 0, 40, 44, 0], maxRatio: 0.5 },
    { name: "neighbours, 4 players rank:9,4,2,0", p: P4, a: [0, 22, 1, 77, 0], b: [0, 22, 6, 72, 0], maxRatio: 0.5 },
  ];
  for (const { name, p, a, b, maxRatio } of cases) {
    it(`${name}: the paired interval is narrower than the difference of two independent evaluations`, () => {
      const rounds = 20_000;
      const paired = comparePaired(p, a, b, { rounds, seed: 1 });
      const ia = evaluate(p, a, { rounds, seed: 1 });
      const ib = evaluate(p, b, { rounds, seed: 2 });
      const pairedWidth = paired.diff.high - paired.diff.low;
      const independentWidth = 2 * 1.96 * Math.hypot(ia.payout.se, ib.payout.se);
      console.log(`[crn] ${name}: paired diff ${paired.diff.mean.toFixed(5)} width ${pairedWidth.toFixed(5)}; independent diff ${(ia.payout.mean - ib.payout.mean).toFixed(5)} width ${independentWidth.toFixed(5)}; ratio ${(pairedWidth / independentWidth).toFixed(3)}`);
      expect(pairedWidth).toBeLessThan(maxRatio * independentWidth);
    });
  }
});
