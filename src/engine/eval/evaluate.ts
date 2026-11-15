// Evaluates Blotto allocations against the uniform random crowd: the session-1 entry points, kept
// with their signatures. The work happens in play.ts, which takes any game and any crowd.

import { uniformCrowd } from "../crowds/crowd";
import type { Allocation, BlottoParams } from "../games/blotto/blotto";
import { blottoGame } from "../games/blotto/blottoGame";
import { compareChoices, evaluateChoice, type EvaluateOptions, type Evaluation, type PairedComparison } from "./play";

export { EVAL_LIMITS, type EvaluateOptions, type Evaluation, type PairedComparison } from "./play";

/** Mean payout and outright first-place rate of `candidate` against the uniform random crowd. */
export function evaluate(p: BlottoParams, candidate: Allocation, opts: EvaluateOptions): Evaluation {
  const game = blottoGame(p);
  return evaluateChoice(game, uniformCrowd(game), candidate, opts);
}

/** Evaluates a and b on identical rounds and reports the paired difference a − b. */
export function comparePaired(p: BlottoParams, a: Allocation, b: Allocation, opts: EvaluateOptions): PairedComparison {
  const game = blottoGame(p);
  return compareChoices(game, uniformCrowd(game), a, b, opts);
}
