import { describe, expect, it } from "vitest";
import { parsePayout, RAW } from "../../core/payout";
import { mulberry32 } from "../../core/rng";
import {
  allocationCount,
  BLOTTO_DEFAULTS,
  blottoParams,
  decodeAllocation,
  encodeAllocation,
  enumerateAllocations,
  neighbour,
  randomAllocation,
  scoreRound,
  validateAllocation,
  validateParams,
} from "./blotto";

const P2 = BLOTTO_DEFAULTS; // castles 1..5 (15 points), 100 soldiers, 2 players, win/lose

describe("blotto scoring, hand-worked", () => {
  it("1v1: 8 of 15 points wins", () => {
    // Seat 0 takes castles 3 and 5 (3 + 5 = 8); seat 1 takes 1, 2 and 4 (1 + 2 + 4 = 7).
    const r = scoreRound(P2, [[0, 0, 50, 0, 50], [20, 20, 0, 60, 0]]);
    expect(r.points).toEqual([8, 7]);
    expect(r.payouts).toEqual([1, 0]);
  });

  it("1v1: a 7.5-7.5 tie pays 0.5 each under win/lose", () => {
    // Castle 1 tied 10-10 (0.5 each); seat 0 takes 2 and 5 (7), seat 1 takes 3 and 4 (7).
    const r = scoreRound(P2, [[10, 40, 0, 0, 50], [10, 0, 45, 45, 0]]);
    expect(r.points).toEqual([7.5, 7.5]);
    expect(r.payouts).toEqual([0.5, 0.5]);
  });

  it("four players, rank:9,4,2,0: two tie for first and get 6.5 each", () => {
    const p = blottoParams({ players: 4, payout: parsePayout("rank:9,4,2,0") });
    // A takes castle 5 (5); B takes 1 and 4 (5); C takes 3; D takes 2.
    const r = scoreRound(p, [[0, 0, 0, 0, 100], [30, 0, 0, 70, 0], [0, 0, 100, 0, 0], [0, 100, 0, 0, 0]]);
    expect(r.points).toEqual([5, 5, 3, 2]);
    expect(r.payouts).toEqual([6.5, 6.5, 2, 0]);
  });

  it("a castle every player left empty is split among all players", () => {
    const p = blottoParams({ players: 3, payout: RAW });
    // Nobody sends anyone to castle 1 (value 1): a third each. Seat 0 takes 2 and 3; seat 2 takes 4; seat 1 takes 5.
    const r = scoreRound(p, [[0, 25, 25, 25, 25], [0, 0, 0, 0, 100], [0, 0, 0, 100, 0]]);
    expect(r.points[0]).toBeCloseTo(1 / 3 + 5, 12);
    expect(r.points[1]).toBeCloseTo(1 / 3 + 5, 12);
    expect(r.points[2]).toBeCloseTo(1 / 3 + 4, 12);
    expect(r.points.reduce((a, b) => a + b, 0)).toBeCloseTo(15, 12);
  });

  it("identical allocations always tie", () => {
    const a = [20, 20, 20, 20, 20];
    expect(scoreRound(blottoParams({ players: 3 }), [a, a, a]).payouts).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });
});

describe("blotto parameters and allocations", () => {
  it("defaults are valid; bad parameters are named", () => {
    expect(validateParams(P2)).toEqual([]);
    expect(validateParams(blottoParams({ players: 1 }))).toEqual(["players is 1; it must be an integer from 2 to 20"]);
    expect(validateParams(blottoParams({ castleValues: [1, -2, 3] }))[0]).toMatch(/castle 2 has value -2/);
    expect(validateParams(blottoParams({ soldiers: 2.5 }))[0]).toMatch(/soldiers is 2.5/);
    expect(validateParams(blottoParams({ payout: parsePayout("rank:9,4,2,0") }))).toEqual(["rank payout vector has 4 entries but there are only 2 players"]);
  });

  it("there are C(104, 4) = 4,598,126 allocations of 100 soldiers to 5 castles", () => {
    expect(allocationCount(P2)).toBe(4_598_126);
    const small = blottoParams({ castleValues: [1, 2, 3], soldiers: 4 });
    expect(allocationCount(small)).toBe(15);
    expect(enumerateAllocations(small)).toHaveLength(15);
    expect(enumerateAllocations(blottoParams({ castleValues: [1, 2, 3], soldiers: 6 }))).toHaveLength(28);
  });

  it("encode/decode round-trips and names the problem", () => {
    expect(encodeAllocation([15, 0, 41, 44, 0])).toBe("15-0-41-44-0");
    expect(decodeAllocation(P2, "15-0-41-44-0")).toEqual([15, 0, 41, 44, 0]);
    expect(() => decodeAllocation(P2, "15-0-41-44")).toThrow('allocation "15-0-41-44": allocation has 4 counts but there are 5 castles');
    expect(() => decodeAllocation(P2, "15-0-41-43-0")).toThrow("allocation uses 99 soldiers, but soldiers is 100");
    expect(() => decodeAllocation(P2, "15-0-4x-44-0")).toThrow('count 3 ("4x") is not a non-negative integer');
    expect(() => decodeAllocation(P2, "-15-0-41-44-0")).toThrow('count 1 ("") is not a non-negative integer');
    expect(() => decodeAllocation(P2, "15-0-41.5-43.5-0")).toThrow("is not a non-negative integer");
  });

  it("random allocations and neighbours are valid; a neighbour always differs", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 2000; i++) {
      const a = randomAllocation(P2, rng);
      expect(validateAllocation(P2, a)).toEqual([]);
      const b = neighbour(a, rng);
      expect(validateAllocation(P2, b)).toEqual([]);
      expect(b).not.toEqual(a);
    }
    // A single full castle still has a neighbour; the input is not mutated.
    const full = [100, 0, 0, 0, 0];
    expect(validateAllocation(P2, neighbour(full, rng))).toEqual([]);
    expect(full).toEqual([100, 0, 0, 0, 0]);
  });

  it("randomAllocation consumes exactly castles - 1 draws", () => {
    let draws = 0;
    const base = mulberry32(1);
    const counting = () => {
      draws++;
      return base();
    };
    randomAllocation(P2, counting);
    expect(draws).toBe(4);
  });
});
