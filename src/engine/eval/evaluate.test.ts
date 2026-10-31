import { describe, expect, it } from "vitest";
import { parsePayout } from "../core/payout";
import { BLOTTO_DEFAULTS, blottoParams } from "../games/blotto/blotto";
import { comparePaired, evaluate } from "./evaluate";

const P = BLOTTO_DEFAULTS;
const A = [15, 0, 41, 44, 0];
const B = [0, 22, 1, 77, 0];

describe("evaluate: determinism and common random numbers", () => {
  it("the same seed gives identical results; a different seed differs", () => {
    const x = evaluate(P, A, { rounds: 5000, seed: 1 });
    expect(evaluate(P, A, { rounds: 5000, seed: 1 })).toEqual(x);
    expect(evaluate(P, A, { rounds: 5000, seed: 2 }).payout.mean).not.toBe(x.payout.mean);
  });

  it("comparePaired evaluates each side exactly as evaluate does under the same seed", () => {
    const p4 = blottoParams({ players: 4, payout: parsePayout("rank:9,4,2,0") });
    const c = comparePaired(p4, A, B, { rounds: 3000, seed: 7 });
    expect(c.a).toEqual(evaluate(p4, A, { rounds: 3000, seed: 7 }));
    expect(c.b).toEqual(evaluate(p4, B, { rounds: 3000, seed: 7 }));
    expect(c.diff.mean).toBeCloseTo(c.a.payout.mean - c.b.payout.mean, 12);
  });

  it("an allocation compared with itself differs by exactly 0 in every round", () => {
    const c = comparePaired(P, A, A, { rounds: 2000, seed: 3 });
    expect(c.diff.mean).toBe(0);
    expect(c.diff.se).toBe(0);
  });

  it("first-place rate excludes ties and has a Wilson interval", () => {
    // Against a uniform crowd, 20-20-20-20-20 ties some rounds, so outright firsts < mean win/lose payout.
    const e = evaluate(P, [20, 20, 20, 20, 20], { rounds: 5000, seed: 1 });
    expect(e.firstPlace.rate).toBeLessThanOrEqual(e.payout.mean);
    expect(e.firstPlace.low).toBeLessThan(e.firstPlace.rate);
    expect(e.firstPlace.high).toBeGreaterThan(e.firstPlace.rate);
  });

  it("rejects bad input with named problems", () => {
    expect(() => evaluate(P, [1, 2, 3], { rounds: 100, seed: 1 })).toThrow("candidate 1: allocation has 3 counts but there are 5 castles");
    expect(() => evaluate(P, A, { rounds: 1, seed: 1 })).toThrow("rounds is 1");
    expect(() => evaluate(P, A, { rounds: 100, seed: -1 })).toThrow("seed is -1");
  });
});
