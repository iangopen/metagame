// Evaluates one Blotto allocation (optionally against a second, paired) versus a stated crowd.
// Run as: npm run evaluate -- --alloc 15-0-41-44-0 [--compare 0-22-1-77-0] [--crowd uniform]
//   [--players 2] [--payout winlose|raw|rank:9,4,2,0] [--castles 1,2,3,4,5] [--soldiers 100]
//   [--rounds 10000] [--seed 1]
// --crowd takes uniform (the default), even, proportional, fixed:<alloc>/<alloc>, levelk:<1-3> or
// mix:<crowd>=<weight>,... A level-k crowd is searched first, at the standard budget, under --seed.

import { allocationCount, encodeAllocation } from "../src/engine/games/blotto/blotto.ts";
import { blottoGame, buildCrowd, compareChoices, evaluateChoice, formatCrowdSpec, formatPayout, parseCrowdSpec } from "../src/engine/index.ts";
import { BLOTTO_FLAGS, blottoParamsFromArgs, integer, interval, parseArgs, printEvaluation } from "./cli.ts";

const FLAGS = [...BLOTTO_FLAGS, "alloc", "compare", "crowd", "rounds", "seed"] as const;
const DEFAULT_ROUNDS = 10_000;
const DEFAULT_SEED = 1;

function main(): void {
  const args = parseArgs(FLAGS, process.argv.slice(2));
  const params = blottoParamsFromArgs(args);
  const game = blottoGame(params);
  if (args.alloc === undefined) throw new Error("--alloc is required, for example --alloc 15-0-41-44-0");
  const alloc = game.decode(args.alloc);
  const compare = args.compare === undefined ? undefined : game.decode(args.compare);
  const rounds = integer("rounds", args.rounds, DEFAULT_ROUNDS);
  const seed = integer("seed", args.seed, DEFAULT_SEED);
  const spec = parseCrowdSpec(args.crowd ?? "uniform");
  const { crowd } = buildCrowd(game, spec, { seed });

  const command = [
    "npm run evaluate --",
    `--castles ${params.castleValues.join(",")}`,
    `--soldiers ${params.soldiers}`,
    `--players ${params.players}`,
    `--payout ${formatPayout(params.payout)}`,
    ...(spec.kind === "uniform" ? [] : [`--crowd ${formatCrowdSpec(spec)}`]),
    `--alloc ${encodeAllocation(alloc)}`,
    ...(compare ? [`--compare ${encodeAllocation(compare)}`] : []),
    `--rounds ${rounds}`,
    `--seed ${seed}`,
  ].join(" ");

  const total = params.castleValues.reduce((a, b) => a + b, 0);
  const opponents = spec.kind === "uniform" ? "drawn uniformly over all allocations each round" : `drawn each round from the crowd: ${crowd.label}`;
  console.log(`Metagame evaluate: Colonel Blotto against ${spec.kind === "uniform" ? "a uniform random crowd" : "a stated crowd"}`);
  console.log("");
  console.log("Inputs");
  console.log(`  castle values   ${params.castleValues.join(", ")}  (${total} points in total)`);
  console.log(`  soldiers        ${params.soldiers}  (${allocationCount(params).toLocaleString("en-US")} possible allocations)`);
  console.log(`  players         ${params.players}  (candidate in seat 0; ${params.players - 1} opponent(s) ${opponents})`);
  console.log(`  payout          ${formatPayout(params.payout)}`);
  console.log(`  rounds          ${rounds}`);
  console.log(`  seed            ${seed}`);
  console.log("");
  console.log("Results (95% intervals: sampling uncertainty only, against this one stated crowd)");

  const start = performance.now();
  if (compare) {
    const c = compareChoices(game, crowd, alloc, compare, { rounds, seed });
    const ms = performance.now() - start;
    printEvaluation(`alloc   ${encodeAllocation(alloc)}`, c.a);
    printEvaluation(`compare ${encodeAllocation(compare)}`, c.b);
    console.log(`  paired difference, alloc minus compare, over the same ${rounds} rounds`);
    console.log(`    mean payout per round   ${interval(c.diff)}`);
    const verdict = c.diff.low > 0 ? "alloc does better against this crowd" : c.diff.high < 0 ? "compare does better against this crowd" : "not separated at this sample size";
    console.log(`    reading                 ${verdict}`);
    console.log("");
    console.log(`Runtime  ${(ms / 1000).toFixed(2)} s`);
  } else {
    const e = evaluateChoice(game, crowd, alloc, { rounds, seed });
    const ms = performance.now() - start;
    printEvaluation(`alloc   ${encodeAllocation(alloc)}`, e);
    console.log("");
    console.log(`Runtime  ${(ms / 1000).toFixed(2)} s`);
  }
  console.log(`Reproduce  ${command}`);
}

try {
  main();
} catch (e) {
  console.error(`evaluate: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
