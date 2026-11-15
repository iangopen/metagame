// A crowd as plain data: what a share link, a settings form or a command line carries. buildCrowd
// turns a spec into a Crowd for one game; level-k parts run their searches there.
//
// Text form (no spaces, and no characters a shell treats specially):
//   uniform
//   <heuristic>                      a name from game.heuristics, such as even or proportional
//   fixed:<choice>/<choice>/...      each opponent plays one listed choice, uniformly
//   levelk:<k>                       level k over a uniform level 0; levelk:<k>:<base> over another base
//   mix:<spec>=<weight>,<spec>=<weight>,...

import type { Game } from "../core/game";
import type { SearchOptions } from "../search/search";
import { fixedCrowd, heuristicCrowd, mixtureCrowd, uniformCrowd, type Crowd } from "./crowd";
import { levelK, LEVEL_K_MAX, type Level } from "./levelK";

export type CrowdSpec =
  | { readonly kind: "uniform" }
  | { readonly kind: "heuristic"; readonly name: string }
  | { readonly kind: "fixed"; /** Encoded choices. */ readonly choices: readonly string[]; readonly weights?: readonly number[] }
  | { readonly kind: "levelK"; readonly level: number; readonly base: CrowdSpec }
  | { readonly kind: "mixture"; readonly parts: readonly { readonly weight: number; readonly crowd: CrowdSpec }[] };

export const UNIFORM_SPEC: CrowdSpec = { kind: "uniform" };

/** Parses the text form. Throws an Error naming the problem. Heuristic names are checked by buildCrowd. */
export function parseCrowdSpec(text: string): CrowdSpec {
  const t = text.trim();
  if (t === "") throw new Error("crowd is empty");
  if (t === "uniform") return UNIFORM_SPEC;
  if (t.startsWith("mix:")) {
    const parts = t.slice(4).split(",").map((part, i) => {
      const at = part.lastIndexOf("=");
      const weight = at < 0 || part.slice(at + 1).trim() === "" ? NaN : Number(part.slice(at + 1));
      if (at <= 0 || !Number.isFinite(weight) || weight < 0) throw new Error(`crowd "${text}": mix part ${i + 1} ("${part}") must be <crowd>=<weight> with a weight that is not negative`);
      const crowd = parseCrowdSpec(part.slice(0, at));
      if (crowd.kind === "mixture") throw new Error(`crowd "${text}": a mix cannot contain another mix`);
      return { weight, crowd };
    });
    return { kind: "mixture", parts };
  }
  if (t.startsWith("levelk:")) {
    const rest = t.slice(7);
    const colon = rest.indexOf(":");
    const levelText = colon < 0 ? rest : rest.slice(0, colon);
    if (!/^\d+$/.test(levelText) || Number(levelText) < 1 || Number(levelText) > LEVEL_K_MAX) throw new Error(`crowd "${text}": the level must be an integer from 1 to ${LEVEL_K_MAX}`);
    const base = colon < 0 ? UNIFORM_SPEC : parseCrowdSpec(rest.slice(colon + 1));
    if (base.kind === "mixture") throw new Error(`crowd "${text}": in text form a level-k base cannot be a mix`);
    return { kind: "levelK", level: Number(levelText), base };
  }
  if (t.startsWith("fixed:")) {
    const choices = t.slice(6).split("/");
    if (choices.some((c) => c === "")) throw new Error(`crowd "${text}": fixed needs choices separated by "/"`);
    return { kind: "fixed", choices };
  }
  if (!/^[a-z][a-z0-9_]*$/i.test(t)) throw new Error(`crowd "${text}" is not uniform, a heuristic name, fixed:..., levelk:... or mix:...`);
  return { kind: "heuristic", name: t };
}

/** Inverse of parseCrowdSpec for every spec the text form can express (weighted fixed lists print unweighted). */
export function formatCrowdSpec(spec: CrowdSpec): string {
  switch (spec.kind) {
    case "uniform":
      return "uniform";
    case "heuristic":
      return spec.name;
    case "fixed":
      return `fixed:${spec.choices.join("/")}`;
    case "levelK":
      return spec.base.kind === "uniform" ? `levelk:${spec.level}` : `levelk:${spec.level}:${formatCrowdSpec(spec.base)}`;
    case "mixture":
      return `mix:${spec.parts.map((p) => `${formatCrowdSpec(p.crowd)}=${p.weight}`).join(",")}`;
  }
}

export interface BuiltCrowd<C> {
  readonly crowd: Crowd<C>;
  /** Every level-k chain the spec needed, keyed by the base crowd's text form. */
  readonly levels: ReadonlyMap<string, Level<C>[]>;
}

/**
 * Builds the crowd a spec describes. `searchOpts` (seed and budget) is used only by level-k parts;
 * a chain over one base is searched once to the deepest level the spec asks for and shared.
 */
export function buildCrowd<C>(game: Game<C>, spec: CrowdSpec, searchOpts: SearchOptions<C>): BuiltCrowd<C> {
  const deepest = new Map<string, number>();
  const scan = (s: CrowdSpec): void => {
    if (s.kind === "levelK") {
      const key = formatCrowdSpec(s.base);
      deepest.set(key, Math.max(deepest.get(key) ?? 0, s.level));
      scan(s.base);
    } else if (s.kind === "mixture") s.parts.forEach((p) => scan(p.crowd));
  };
  scan(spec);
  const levels = new Map<string, Level<C>[]>();
  const build = (s: CrowdSpec): Crowd<C> => {
    switch (s.kind) {
      case "uniform":
        return uniformCrowd(game);
      case "heuristic":
        return heuristicCrowd(game, s.name);
      case "fixed":
        return fixedCrowd(game, s.choices.map((c) => game.decode(c)), s.weights);
      case "mixture":
        return mixtureCrowd(s.parts.map((p) => ({ weight: p.weight, crowd: build(p.crowd) })));
      case "levelK": {
        const key = formatCrowdSpec(s.base);
        let chain = levels.get(key);
        if (chain === undefined) {
          chain = levelK(game, build(s.base), deepest.get(key)!, searchOpts);
          levels.set(key, chain);
        }
        const level = chain[s.level - 1];
        if (level === undefined) throw new Error(`level is ${s.level}; it must be an integer from 1 to ${LEVEL_K_MAX}`);
        return level.crowd;
      }
    }
  };
  return { crowd: build(spec), levels };
}
