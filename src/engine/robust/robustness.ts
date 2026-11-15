// Robustness: how a set of strategies holds up when the crowd changes. This is the model-
// uncertainty axis. Each cell of the strategy-by-crowd matrix carries its own sampling interval
// against that one crowd; the summaries across crowds (worst case, largest regret) point at cells
// and never fold the crowds into one interval.
//
// Every strategy meets the same rounds of a crowd (common random numbers), so a regret is a paired
// difference. Regret is measured against the best of the LISTED strategies for that crowd, the best
// found, not against an optimum.

import type { Game } from "../core/game";
import type { MeanInterval } from "../core/meanInterval";
import type { Crowd } from "../crowds/crowd";
import { evaluateChoices, type EvaluateOptions, type Evaluation } from "../eval/play";

export const ROBUSTNESS_LIMITS = { maxStrategies: 64, maxCrowds: 32 } as const;

export interface StrategySummary {
  /** The crowd this strategy scores lowest against, and its mean payout there. */
  readonly worstCrowd: number;
  readonly worstPayout: number;
  /** The crowd where this strategy gives up the most to the best listed strategy, and how much. */
  readonly maxRegretCrowd: number;
  readonly maxRegret: number;
}

export interface Robustness {
  /** cells[s][c]: strategy s against crowd c. Equals evaluateChoice(game, crowds[c], strategies[s], opts). */
  readonly cells: Evaluation[][];
  /** best[c]: index of the listed strategy with the highest mean payout against crowd c (first on ties). */
  readonly best: number[];
  /**
   * regret[s][c]: payout of best[c] minus payout of s, per round on the same rounds, with its own 95%
   * interval. Exactly 0 for s = best[c]. An interval that contains 0 means s is not separated from the best.
   */
  readonly regret: MeanInterval[][];
  readonly strategies: StrategySummary[];
  /** The listed strategy whose worst-case payout is highest (first on ties). */
  readonly bestWorstCase: number;
  /** The listed strategy whose largest regret is smallest (first on ties). */
  readonly smallestMaxRegret: number;
}

/** The strategy-by-crowd matrix with regret per crowd and the worst case across crowds. */
export function robustness<C>(game: Game<C>, strategies: readonly C[], crowds: readonly Crowd<C>[], opts: EvaluateOptions): Robustness {
  const L = ROBUSTNESS_LIMITS;
  if (strategies.length < 1 || strategies.length > L.maxStrategies) throw new Error(`there are ${strategies.length} strategies; allowed is 1 to ${L.maxStrategies}`);
  if (crowds.length < 1 || crowds.length > L.maxCrowds) throw new Error(`there are ${crowds.length} crowds; allowed is 1 to ${L.maxCrowds}`);
  const nS = strategies.length;
  const cells: Evaluation[][] = strategies.map(() => []);
  const regret: MeanInterval[][] = strategies.map(() => []);
  const best: number[] = [];
  crowds.forEach((crowd, c) => {
    // First pass finds the best listed strategy; the second takes paired differences against it.
    const first = evaluateChoices(game, crowd, strategies, opts);
    let b = 0;
    for (let s = 1; s < nS; s++) if (first.evaluations[s]!.payout.mean > first.evaluations[b]!.payout.mean) b = s;
    const paired = evaluateChoices(game, crowd, strategies, opts, b);
    best.push(b);
    for (let s = 0; s < nS; s++) {
      cells[s]![c] = paired.evaluations[s]!;
      const d = paired.diffs![s]!; // s − best
      regret[s]![c] = { n: d.n, mean: 0 - d.mean, se: d.se, low: 0 - d.high, high: 0 - d.low }; // 0 − x, so a zero stays +0
    }
  });
  const summaries: StrategySummary[] = strategies.map((_, s) => {
    let worstCrowd = 0;
    let maxRegretCrowd = 0;
    for (let c = 1; c < crowds.length; c++) {
      if (cells[s]![c]!.payout.mean < cells[s]![worstCrowd]!.payout.mean) worstCrowd = c;
      if (regret[s]![c]!.mean > regret[s]![maxRegretCrowd]!.mean) maxRegretCrowd = c;
    }
    return { worstCrowd, worstPayout: cells[s]![worstCrowd]!.payout.mean, maxRegretCrowd, maxRegret: regret[s]![maxRegretCrowd]!.mean };
  });
  let bestWorstCase = 0;
  let smallestMaxRegret = 0;
  for (let s = 1; s < nS; s++) {
    if (summaries[s]!.worstPayout > summaries[bestWorstCase]!.worstPayout) bestWorstCase = s;
    if (summaries[s]!.maxRegret < summaries[smallestMaxRegret]!.maxRegret) smallestMaxRegret = s;
  }
  return { cells, best, regret, strategies: summaries, bestWorstCase, smallestMaxRegret };
}
