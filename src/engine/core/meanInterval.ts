// Standard-error interval for a mean. Not part of StrategyLab (it computes SEs inline per stat);
// kept next to the copied interval.ts, which it does not modify, and reuses its Z_95.

import { Z_95 } from "./interval";

/** Running mean and sum of squared deviations (Welford). Mutable builder; one per estimate. */
export interface MeanAccumulator {
  n: number;
  mean: number;
  m2: number;
}

export function createMeanAccumulator(): MeanAccumulator {
  return { n: 0, mean: 0, m2: 0 };
}

export function addSample(acc: MeanAccumulator, x: number): void {
  acc.n++;
  const d = x - acc.mean;
  acc.mean += d / acc.n;
  acc.m2 += d * (x - acc.mean);
}

export interface MeanInterval {
  n: number;
  mean: number;
  /** Standard error of the mean: sample standard deviation (n − 1) / sqrt(n). */
  se: number;
  low: number;
  high: number;
}

/**
 * mean ± z·SE. Normal approximation: fine for the bounded per-round payouts this repo averages
 * over thousands of rounds, and checked for coverage by the Blotto anchor tests. NaN SE and bounds
 * when n < 2.
 */
export function meanInterval(acc: MeanAccumulator, z = Z_95): MeanInterval {
  if (acc.n < 2) return { n: acc.n, mean: acc.n === 0 ? NaN : acc.mean, se: NaN, low: NaN, high: NaN };
  const se = Math.sqrt(acc.m2 / (acc.n - 1) / acc.n);
  return { n: acc.n, mean: acc.mean, se, low: acc.mean - z * se, high: acc.mean + z * se };
}
