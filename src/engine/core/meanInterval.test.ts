import { describe, expect, it } from "vitest";
import { addSample, createMeanAccumulator, meanInterval } from "./meanInterval";

describe("meanInterval", () => {
  it("matches the hand-computed mean and SE", () => {
    // 1, 2, 3, 4: mean 2.5, sample variance 5/3, SE sqrt(5/3 / 4) = 0.645497.
    const acc = createMeanAccumulator();
    for (const x of [1, 2, 3, 4]) addSample(acc, x);
    const r = meanInterval(acc);
    expect(r.mean).toBe(2.5);
    expect(r.se).toBeCloseTo(0.645497, 6);
    expect(r.low).toBeCloseTo(2.5 - 1.96 * 0.645497, 5);
    expect(r.high).toBeCloseTo(2.5 + 1.96 * 0.645497, 5);
  });

  it("a constant sample has zero width", () => {
    const acc = createMeanAccumulator();
    for (let i = 0; i < 10; i++) addSample(acc, 0.5);
    const r = meanInterval(acc);
    expect(r.se).toBe(0);
    expect(r.low).toBe(0.5);
  });

  it("NaN SE below two samples", () => {
    const acc = createMeanAccumulator();
    expect(meanInterval(acc).mean).toBeNaN();
    addSample(acc, 3);
    expect(meanInterval(acc).mean).toBe(3);
    expect(meanInterval(acc).se).toBeNaN();
  });
});
