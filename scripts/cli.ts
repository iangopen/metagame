// Shared by the CLI scripts: plain argument parsing and number formatting. No shell features, so
// the scripts run the same in PowerShell and on macOS.

import { BLOTTO_DEFAULTS, parsePayout, validateParams, type BlottoParams, type Evaluation, type MeanInterval } from "../src/engine/index.ts";

export function parseArgs<F extends string>(flags: readonly F[], argv: string[]): Partial<Record<F, string>> {
  const out: Partial<Record<F, string>> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const name = arg.startsWith("--") ? arg.slice(2) : "";
    if (!(flags as readonly string[]).includes(name)) throw new Error(`unknown argument "${arg}"; expected one of ${flags.map((f) => `--${f}`).join(", ")}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
    out[name as F] = value;
  }
  return out;
}

export function integer(name: string, text: string | undefined, fallback: number): number {
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

export const BLOTTO_FLAGS = ["castles", "soldiers", "players", "payout"] as const;

/** Blotto parameters from --castles, --soldiers, --players and --payout, validated. */
export function blottoParamsFromArgs(args: Partial<Record<(typeof BLOTTO_FLAGS)[number], string>>): BlottoParams {
  const params: BlottoParams = {
    castleValues: castleValues(args.castles),
    soldiers: integer("soldiers", args.soldiers, BLOTTO_DEFAULTS.soldiers),
    players: integer("players", args.players, BLOTTO_DEFAULTS.players),
    payout: args.payout === undefined ? BLOTTO_DEFAULTS.payout : parsePayout(args.payout),
  };
  const errors = validateParams(params);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return params;
}

export const fmt = (x: number, digits = 4): string => x.toFixed(digits);
export const pct = (x: number): string => `${(100 * x).toFixed(2)}%`;
export const interval = (m: MeanInterval): string => `${fmt(m.mean)}  [${fmt(m.low)}, ${fmt(m.high)}]  (SE ${fmt(m.se, 5)})`;

export function printEvaluation(label: string, e: Evaluation): void {
  console.log(`  ${label}`);
  console.log(`    mean payout per round   ${interval(e.payout)}`);
  console.log(`    outright first place    ${pct(e.firstPlace.rate)}  [${pct(e.firstPlace.low)}, ${pct(e.firstPlace.high)}]  (${e.firstPlace.count} of ${e.rounds} rounds, Wilson)`);
}
