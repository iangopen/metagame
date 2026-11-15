// The engine's public surface: what a CLI script, a test or the future worker and UI call.
// Everything here is pure, DOM-free and deterministic under a seed.

export type { Game, RoundScore } from "./core/game";
export type { MeanInterval } from "./core/meanInterval";
export { formatPayout, parsePayout, RAW, WIN_LOSE, type PayoutRule } from "./core/payout";

export { BLOTTO_DEFAULTS, BLOTTO_LIMITS, blottoParams, validateParams, type Allocation, type BlottoParams } from "./games/blotto/blotto";
export { blottoGame } from "./games/blotto/blottoGame";
export { GUESS_DEFAULTS, GUESS_LIMITS, guessGame, guessParams, validateGuessParams, type GuessParams } from "./games/guess/guess";

export { CROWD_LIMITS, fixedCrowd, heuristicCrowd, mixtureCrowd, pointCrowd, uniformCrowd, type Crowd } from "./crowds/crowd";
export { LEVEL_K_MAX, levelK, type Level } from "./crowds/levelK";
export { buildCrowd, formatCrowdSpec, parseCrowdSpec, UNIFORM_SPEC, type BuiltCrowd, type CrowdSpec } from "./crowds/spec";

export { compareChoices, evaluateChoice, evaluateChoices, EVAL_LIMITS, type EvaluateOptions, type Evaluation, type ManyEvaluations, type PairedComparison } from "./eval/play";
export { search, SEARCH_DEFAULTS, SEARCH_LIMITS, SEARCH_PRESETS, type Finalist, type SearchOptions, type SearchResult, type SearchSettings } from "./search/search";
export { robustness, ROBUSTNESS_LIMITS, type Robustness, type StrategySummary } from "./robust/robustness";
