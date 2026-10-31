import { describe, expect, it } from "vitest";
import { applyPayout, formatPayout, isOutrightFirst, parsePayout, rankPayouts, RAW, validatePayout, WIN_LOSE } from "./payout";

describe("rankPayouts", () => {
  it("pays by rank with no ties", () => {
    expect(rankPayouts([3, 9, 1, 5], [9, 4, 2, 0])).toEqual([2, 9, 0, 4]);
  });

  it("tied players share the payouts of the ranks they jointly occupy", () => {
    // Two tie for first: (9 + 4) / 2 each. Three tie for second: (4 + 2 + 0) / 3 each.
    expect(rankPayouts([5, 5, 3, 2], [9, 4, 2, 0])).toEqual([6.5, 6.5, 2, 0]);
    expect(rankPayouts([7, 1, 1, 1], [9, 4, 2, 0])).toEqual([9, 2, 2, 2]);
    expect(rankPayouts([1, 1, 1, 1], [9, 4, 2, 0])).toEqual([3.75, 3.75, 3.75, 3.75]);
  });

  it("missing ranks pay 0, so win/lose [1] splits a tie for first", () => {
    expect(rankPayouts([7.5, 7.5], [1])).toEqual([0.5, 0.5]);
    expect(rankPayouts([8, 7], [1])).toEqual([1, 0]);
    expect(rankPayouts([4, 4, 4], [1])).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it("points that differ only by float rounding are tied", () => {
    const third = 1 / 3;
    expect(rankPayouts([third + third + third, 1], [1])).toEqual([0.5, 0.5]);
  });

  it("total payout is conserved", () => {
    const vector = [9, 4, 2, 0];
    for (const pts of [[1, 2, 3, 4], [2, 2, 1, 1], [0, 0, 0, 5], [3, 3, 3, 3]]) {
      const sum = rankPayouts(pts, vector).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(15, 12);
    }
  });
});

describe("payout rules", () => {
  it("raw returns the points", () => {
    expect(applyPayout(RAW, [1.5, 2])).toEqual([1.5, 2]);
  });

  it("isOutrightFirst excludes ties", () => {
    expect(isOutrightFirst([8, 7], 0)).toBe(true);
    expect(isOutrightFirst([7.5, 7.5], 0)).toBe(false);
    expect(isOutrightFirst([5, 5, 3, 2], 2)).toBe(false);
  });

  it("parses and formats", () => {
    expect(parsePayout("winlose")).toEqual(WIN_LOSE);
    expect(parsePayout("raw")).toEqual(RAW);
    expect(parsePayout("rank:9,4,2,0")).toEqual({ kind: "rank", vector: [9, 4, 2, 0] });
    expect(formatPayout(parsePayout("rank:9,4,2,0"))).toBe("rank:9,4,2,0");
    expect(formatPayout({ kind: "rank", vector: [1, 0, 0] })).toBe("winlose");
    expect(() => parsePayout("rank:9,x")).toThrow(/entry 2/);
    expect(() => parsePayout("best")).toThrow(/not one of/);
  });

  it("validation names the problem", () => {
    expect(validatePayout({ kind: "rank", vector: [9, 4, 2, 0] }, 2)).toEqual(["rank payout vector has 4 entries but there are only 2 players"]);
    expect(validatePayout({ kind: "rank", vector: [] }, 2)).toEqual(["rank payout vector is empty"]);
    expect(validatePayout(WIN_LOSE, 2)).toEqual([]);
  });
});
