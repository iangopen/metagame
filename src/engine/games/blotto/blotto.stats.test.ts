import { describe, expect, it } from "vitest";
import { mulberry32, type Rng } from "../../core/rng";
import { blottoParams, encodeAllocation, enumerateAllocations, randomAllocation } from "./blotto";

// Chi-square goodness of fit of randomAllocation against the uniform distribution over all 15
// compositions of 4 soldiers into 3 castles. Threshold: the upper 1e-4 quantile (Wilson–Hilferty),
// the same standard as StrategyLab's rng chi-square test: a correct sampler fails about once in
// 10,000 seeds, and the seed here is fixed.

const P = blottoParams({ castleValues: [1, 2, 3], soldiers: 4 });
const CELLS = enumerateAllocations(P).map(encodeAllocation);
const DF = CELLS.length - 1;
const Z_1E4 = 3.719016;
const N = 150_000;

function chiSquareThreshold(df: number, z = Z_1E4): number {
  const a = 2 / (9 * df);
  return df * (1 - a + z * Math.sqrt(a)) ** 3;
}
const THRESHOLD = chiSquareThreshold(DF);

function chiSquare(sample: (rng: Rng) => number[], seed: number): number {
  const rng = mulberry32(seed);
  const counts = new Map<string, number>(CELLS.map((c) => [c, 0]));
  for (let i = 0; i < N; i++) {
    const key = encodeAllocation(sample(rng));
    const c = counts.get(key);
    if (c === undefined) throw new Error(`draw ${i} is not a valid allocation: ${key}`);
    counts.set(key, c + 1);
  }
  const expected = N / CELLS.length;
  let x2 = 0;
  for (const c of counts.values()) x2 += ((c - expected) * (c - expected)) / expected;
  return x2;
}

/**
 * The WRONG sampler, kept as the power check: independent uniforms, normalised to the soldier total
 * and rounded by largest remainder. Valid allocations, but not uniform over compositions.
 */
function normalisedUniformAllocation(soldiers: number, castles: number, rng: Rng): number[] {
  const u = Array.from({ length: castles }, () => rng());
  const total = u.reduce((a, b) => a + b, 0);
  const raw = u.map((x) => (x / total) * soldiers);
  const out = raw.map(Math.floor);
  let left = soldiers - out.reduce((a, b) => a + b, 0);
  const byRemainder = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of byRemainder) {
    if (left-- <= 0) break;
    out[i]!++;
  }
  return out;
}

function report(name: string, x2: number): void {
  console.log(`[blotto uniformity] ${name}: chi2 = ${x2.toFixed(2)}, df = ${DF}, threshold (p = 1e-4) = ${THRESHOLD.toFixed(2)}`);
}

describe(`blotto uniform sampler: chi-square over the compositions of 4 soldiers into 3 castles (${N} draws)`, () => {
  it("there are 15 cells", () => {
    expect(CELLS).toHaveLength(15);
  });

  it("randomAllocation (stars and bars) passes", () => {
    const x2 = chiSquare((rng) => randomAllocation(P, rng), 2024);
    report("stars and bars", x2);
    expect(x2).toBeLessThan(THRESHOLD);
  });

  it("the test has power: normalised independent uniforms fail", () => {
    const x2 = chiSquare((rng) => normalisedUniformAllocation(4, 3, rng), 2024);
    report("normalised uniforms", x2);
    expect(x2).toBeGreaterThan(THRESHOLD);
  });
});
