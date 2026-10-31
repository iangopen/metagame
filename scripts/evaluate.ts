// Evaluates one Blotto allocation (optionally against a second, paired) versus the uniform random
// crowd. Run as: npm run evaluate -- --alloc 15-0-41-44-0 [--compare 0-22-1-77-0] [--players 2]
//   [--payout winlose|raw|rank:9,4,2,0] [--castles 1,2,3,4,5] [--soldiers 100] [--rounds 10000] [--seed 1]
// Plain argument parsing and no shell features, so it runs the same in PowerShell and on macOS.

import { formatPayout, parsePayout } from "../src/engine/core/payout.ts";
import { allocationCount, BLOTTO_DEFAULTS, decodeAllocation, encodeAllocation, validateParams, type BlottoParams } from "../src/engine/games/blotto/blotto.ts";
import { comparePaired, evaluate, type Evaluation } from "../src/engine/eval/evaluate.ts";
import type { MeanInterval } from "../src/engine/core/meanInterval.ts";

const FLAGS = ["castles", "soldiers", "players", "payout", "alloc", "compare", "rounds", "seed"] as const;
type Flag = (typeof FLAGS)[number];
const DEFAULT_ROUNDS = 10_000;
const DEFAULT_SEED = 1;

function parseArgs(argv: string[]): Partial<Record<Flag, string>> {
  const out: Partial<Record<Flag, string>> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const name = arg.startsWith("--") ? arg.slice(2) : "";
    if (!(FLAGS as readonly string[]).includes(name)) throw new Error(`unknown argument "${arg}"; expected one of ${FLAGS.map((f) => `--${f}`).join(", ")}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
    out[name as Flag] = value;
  }
  return out;
}

function integer(name: string, text: string | undefined, fallback: number): number {
  if (text === undefined) return fallback;
  if (!/^\d+$/.test(text)) throw new Error(`--${name} "${text}" is not a non-negative integer`);
  return Number(text);
}

function castleValues(text: string | undefined): number[] {
  if (text === undefined) return BLOTTO_DEFAULTS.castleValues.slice();
  return text.split(",").map((s, i) => {
    const x = s.trim() === "" ? NaN : Number(s);
    if (!Number.isFinite(x)) throw new Error(`--castles value ${i + 1} ("${s}") is not a number`);
    return x;
  });
}

const fmt = (x: number, digits = 4) => x.toFixed(digits);
const pct = (x: number) => `${(100 * x).toFixed(2)}%`;
const interval = (m: MeanInterval) => `${fmt(m.mean)}  [${fmt(m.low)}, ${fmt(m.high)}]  (SE ${fmt(m.se, 5)})`;

function printEvaluation(label: string, e: Evaluation): void {
  console.log(`  ${label}`);
  console.log(`    mean payout per round   ${interval(e.payout)}`);
  console.log(`    outright first place    ${pct(e.firstPlace.rate)}  [${pct(e.firstPlace.low)}, ${pct(e.firstPlace.high)}]  (${e.firstPlace.count} of ${e.rounds} rounds, Wilson)`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const params: BlottoParams = {
    castleValues: castleValues(args.castles),
    soldiers: integer("soldiers", args.soldiers, BLOTTO_DEFAULTS.soldiers),
    players: integer("players", args.players, BLOTTO_DEFAULTS.players),
    payout: args.payout === undefined ? BLOTTO_DEFAULTS.payout : parsePayout(args.payout),
  };
  const paramErrors = validateParams(params);
  if (paramErrors.length > 0) throw new Error(paramErrors.join("; "));
  if (args.alloc === undefined) throw new Error("--alloc is required, for example --alloc 15-0-41-44-0");
  const alloc = decodeAllocation(params, args.alloc);
  const compare = args.compare === undefined ? undefined : decodeAllocation(params, args.compare);
  const rounds = integer("rounds", args.rounds, DEFAULT_ROUNDS);
  const seed = integer("seed", args.seed, DEFAULT_SEED);

  const command = [
    "npm run evaluate --",
    `--castles ${params.castleValues.join(",")}`,
    `--soldiers ${params.soldiers}`,
    `--players ${params.players}`,
    `--payout ${formatPayout(params.payout)}`,
    `--alloc ${encodeAllocation(alloc)}`,
    ...(compare ? [`--compare ${encodeAllocation(compare)}`] : []),
    `--rounds ${rounds}`,
    `--seed ${seed}`,
  ].join(" ");

  const total = params.castleValues.reduce((a, b) => a + b, 0);
  console.log("Metagame evaluate: Colonel Blotto against a uniform random crowd");
  console.log("");
  console.log("Inputs");
  console.log(`  castle values   ${params.castleValues.join(", ")}  (${total} points in total)`);
  console.log(`  soldiers        ${params.soldiers}  (${allocationCount(params).toLocaleString("en-US")} possible allocations)`);
  console.log(`  players         ${params.players}  (candidate in seat 0; ${params.players - 1} opponent(s) drawn uniformly over all allocations each round)`);
  console.log(`  payout          ${formatPayout(params.payout)}`);
  console.log(`  rounds          ${rounds}`);
  console.log(`  seed            ${seed}`);
  console.log("");
  console.log("Results (95% intervals: sampling uncertainty only, against this one stated crowd)");

  const start = performance.now();
  if (compare) {
    const c = comparePaired(params, alloc, compare, { rounds, seed });
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
    const e = evaluate(params, alloc, { rounds, seed });
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
