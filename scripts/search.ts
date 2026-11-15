// Searches for the best FOUND Blotto allocation against a stated crowd, and optionally shows how
// it holds up against other crowds.
// Run as: npm run search -- [--crowd uniform] [--budget quick|standard|thorough] [--include <alloc>/<alloc>]
//   [--robust <crowd>+<crowd>+...] [--players 2] [--payout winlose|raw|rank:9,4,2,0]
//   [--castles 1,2,3,4,5] [--soldiers 100] [--seed 1]
// A crowd is uniform, even, proportional, fixed:<alloc>/<alloc>, levelk:<1-3> or
// mix:<crowd>=<weight>,<crowd>=<weight>. Example: --crowd mix:uniform=0.5,proportional=0.3,levelk:1=0.2

import { allocationCount, encodeAllocation, type Allocation } from "../src/engine/games/blotto/blotto.ts";
import { blottoGame, buildCrowd, formatCrowdSpec, formatPayout, parseCrowdSpec, robustness, search, SEARCH_PRESETS, type Crowd, type Level } from "../src/engine/index.ts";
import { BLOTTO_FLAGS, blottoParamsFromArgs, fmt, integer, interval, parseArgs, printEvaluation } from "./cli.ts";

const FLAGS = [...BLOTTO_FLAGS, "crowd", "budget", "include", "robust", "seed"] as const;
const DEFAULT_SEED = 1;
const ROBUST_ROUNDS = 20_000;

function printLevels(levels: ReadonlyMap<string, Level<Allocation>[]>): void {
  for (const [base, chain] of levels) {
    console.log(`  level-k chain over a level 0 of ${base} (each level is the best found response to the one below)`);
    for (const l of chain) console.log(`    level ${l.level} plays ${encodeAllocation(l.choice)}   payout against the level below ${interval(l.search.holdout.payout)}`);
  }
}

function main(): void {
  const args = parseArgs(FLAGS, process.argv.slice(2));
  const params = blottoParamsFromArgs(args);
  const game = blottoGame(params);
  const seed = integer("seed", args.seed, DEFAULT_SEED);
  const budget = args.budget ?? "standard";
  if (!Object.hasOwn(SEARCH_PRESETS, budget)) throw new Error(`--budget "${budget}" is not one of ${Object.keys(SEARCH_PRESETS).join(", ")}`);
  const settings = SEARCH_PRESETS[budget as keyof typeof SEARCH_PRESETS];
  const include = args.include === undefined ? [] : args.include.split("/").map((t) => game.decode(t));
  const spec = parseCrowdSpec(args.crowd ?? "uniform");
  const robustSpecs = args.robust === undefined ? [] : args.robust.split("+").map(parseCrowdSpec);

  const command = [
    "npm run search --",
    `--castles ${params.castleValues.join(",")}`,
    `--soldiers ${params.soldiers}`,
    `--players ${params.players}`,
    `--payout ${formatPayout(params.payout)}`,
    `--crowd ${formatCrowdSpec(spec)}`,
    `--budget ${budget}`,
    ...(include.length > 0 ? [`--include ${include.map(encodeAllocation).join("/")}`] : []),
    ...(robustSpecs.length > 0 ? [`--robust ${robustSpecs.map(formatCrowdSpec).join("+")}`] : []),
    `--seed ${seed}`,
  ].join(" ");

  const start = performance.now();
  const built = buildCrowd(game, spec, { seed, ...settings });
  const crowdMs = performance.now() - start;

  const total = params.castleValues.reduce((a, b) => a + b, 0);
  console.log("Metagame search: Colonel Blotto, the best found allocation against a stated crowd");
  console.log("");
  console.log("Inputs");
  console.log(`  castle values   ${params.castleValues.join(", ")}  (${total} points in total)`);
  console.log(`  soldiers        ${params.soldiers}  (${allocationCount(params).toLocaleString("en-US")} possible allocations)`);
  console.log(`  players         ${params.players}  (candidate in seat 0; ${params.players - 1} opponent(s) drawn each round from the crowd)`);
  console.log(`  payout          ${formatPayout(params.payout)}`);
  console.log(`  crowd           ${built.crowd.label}`);
  printLevels(built.levels);
  console.log(`  budget          ${budget}  (pool ${settings.samples} random, ${settings.starts} climbs of ${settings.climbSteps} steps on ${settings.climbRounds} rounds, ${settings.finalists} finalists on ${settings.finalRounds} rounds)`);
  console.log(`  seed            ${seed}`);
  console.log("");

  const searchStart = performance.now();
  const r = search(game, built.crowd, { seed, ...settings, include });
  const searchMs = performance.now() - searchStart;

  console.log("Best found (not proven best: the search looked at a sample of the allocations)");
  console.log(`  allocation      ${encodeAllocation(r.best)}`);
  console.log(`  looked at       ${r.choicesSeen.toLocaleString("en-US")} allocations${r.exhaustive ? " (every allocation was in the pool)" : ""}, ${r.scorings.toLocaleString("en-US")} round scorings`);
  if (r.exact) console.log("  the crowd is a single allocation and Blotto has no chance moves, so these numbers are exact");
  console.log("");
  console.log(`Held-out result (95% intervals: sampling uncertainty only, against this one stated crowd; ${r.settings.holdoutRounds} fresh rounds)`);
  printEvaluation(`best found  ${encodeAllocation(r.best)}`, r.holdout);
  if (r.runnerUp) {
    printEvaluation(`runner-up   ${encodeAllocation(r.runnerUp.choice)}`, r.runnerUp.holdout);
    console.log("  paired difference, best found minus runner-up, over the same held-out rounds");
    console.log(`    mean payout per round   ${interval(r.runnerUp.diff)}`);
    const verdict = r.runnerUp.diff.low > 0 ? "the best found does better against this crowd" : r.runnerUp.diff.high < 0 ? "the runner-up does better on the held-out rounds: treat the two as a near-tie" : "not separated at this sample size: treat the two as a near-tie";
    console.log(`    reading                 ${verdict}`);
  }
  console.log(`  on the rounds that selected it the best found scored ${fmt(r.searchEstimate.mean)}; that number is biased upward and is not the result`);
  console.log("");
  console.log("Finalists on the search rounds");
  for (const f of r.finalists.slice(0, 5)) console.log(`  ${encodeAllocation(f.choice).padEnd(20)} ${fmt(f.search.mean)}`);

  let robustMs = 0;
  if (robustSpecs.length > 0) {
    const robustStart = performance.now();
    const crowds: Crowd<Allocation>[] = [built.crowd, ...robustSpecs.map((s) => buildCrowd(game, s, { seed, ...settings }).crowd)];
    const names = [formatCrowdSpec(spec), ...robustSpecs.map(formatCrowdSpec)];
    const strategies: { name: string; choice: Allocation }[] = [{ name: "best found", choice: r.best }, ...Object.entries(game.heuristics).map(([name, choice]) => ({ name, choice })), ...include.map((choice) => ({ name: "included", choice }))];
    const table = robustness(game, strategies.map((s) => s.choice), crowds, { rounds: ROBUST_ROUNDS, seed: r.holdoutSeed });
    robustMs = performance.now() - robustStart;
    console.log("");
    console.log(`Across crowds (model uncertainty: each column is a different crowd; ${ROBUST_ROUNDS} held-out rounds per cell)`);
    console.log("  mean payout, with the regret against the best listed strategy for that crowd in brackets");
    names.forEach((n, c) => console.log(`    crowd ${c + 1}: ${n}  =  ${crowds[c]!.label}`));
    const width = Math.max(...strategies.map((s) => `${s.name} ${encodeAllocation(s.choice)}`.length));
    console.log(`  ${"".padEnd(width)}  ${names.map((_, c) => `crowd ${c + 1}`.padEnd(18)).join("")}worst case`);
    strategies.forEach((s, i) => {
      const cells = crowds.map((_, c) => `${fmt(table.cells[i]![c]!.payout.mean)} (${fmt(table.regret[i]![c]!.mean)})`.padEnd(18)).join("");
      console.log(`  ${`${s.name} ${encodeAllocation(s.choice)}`.padEnd(width)}  ${cells}${fmt(table.strategies[i]!.worstPayout)} vs crowd ${table.strategies[i]!.worstCrowd + 1}`);
    });
    console.log(`  best worst case among these: ${strategies[table.bestWorstCase]!.name}; smallest largest regret: ${strategies[table.smallestMaxRegret]!.name}`);
  }

  console.log("");
  console.log(`Runtime  ${(searchMs / 1000).toFixed(2)} s search${built.levels.size > 0 ? `, ${(crowdMs / 1000).toFixed(2)} s building the level-k crowd` : ""}${robustSpecs.length > 0 ? `, ${(robustMs / 1000).toFixed(2)} s across crowds` : ""}`);
  console.log(`Reproduce  ${command}`);
}

try {
  main();
} catch (e) {
  console.error(`search: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
