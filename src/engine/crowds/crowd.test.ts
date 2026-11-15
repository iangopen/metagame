import { describe, expect, it } from "vitest";
import { mulberry32 } from "../core/rng";
import { blottoParams } from "../games/blotto/blotto";
import { blottoGame } from "../games/blotto/blottoGame";
import { fixedCrowd, heuristicCrowd, mixtureCrowd, pointCrowd, uniformCrowd } from "./crowd";
import { buildCrowd, formatCrowdSpec, parseCrowdSpec } from "./spec";

const game = blottoGame(blottoParams());
const SMALL = blottoGame(blottoParams({ castleValues: [1, 2, 3], soldiers: 6 }));
const QUICK = { seed: 1, samples: 16, starts: 2, climbSteps: 10, climbRounds: 200, finalRounds: 400, holdoutRounds: 400 };

describe("blotto heuristics, hand-worked", () => {
  it("even: 100 soldiers over five castles is 20 each", () => {
    expect(game.heuristics.even).toEqual([20, 20, 20, 20, 20]);
  });

  it("proportional: 100 soldiers by value 1..5 is 7-13-20-27-33", () => {
    // 100 · v / 15 = 6.67, 13.33, 20, 26.67, 33.33: floors 6, 13, 20, 26, 33 use 98. The two left
    // go to the largest fractions (.67 at castles 1 and 4).
    expect(game.heuristics.proportional).toEqual([7, 13, 20, 27, 33]);
  });

  it("even with a remainder gives the spare soldiers to the most valuable castles", () => {
    expect(blottoGame(blottoParams({ castleValues: [1, 2, 3], soldiers: 8 })).heuristics.even).toEqual([2, 3, 3]);
  });
});

describe("crowd samplers", () => {
  it("a point crowd always plays its choice and consumes no randomness", () => {
    const crowd = pointCrowd(game, [20, 20, 20, 20, 20]);
    const rng = mulberry32(1);
    const first = mulberry32(1)();
    for (let i = 0; i < 5; i++) expect(crowd.sample(rng)).toEqual([20, 20, 20, 20, 20]);
    expect(rng()).toBe(first);
    expect(crowd.deterministic).toBe(true);
  });

  it("the uniform crowd draws exactly what randomChoice draws", () => {
    const a = mulberry32(9);
    const b = mulberry32(9);
    const crowd = uniformCrowd(game);
    for (let i = 0; i < 20; i++) expect(crowd.sample(a)).toEqual(game.randomChoice(b));
    expect(crowd.deterministic).toBe(false);
  });

  it("a fixed crowd only plays listed choices; a one-entry list is a point mass", () => {
    const list = [[6, 0, 0], [0, 6, 0], [0, 0, 6]];
    const crowd = fixedCrowd(SMALL, list);
    const rng = mulberry32(3);
    const keys = new Set<string>();
    for (let i = 0; i < 300; i++) keys.add(SMALL.encode(crowd.sample(rng)));
    expect([...keys].sort()).toEqual(["0-0-6", "0-6-0", "6-0-0"]);
    expect(fixedCrowd(SMALL, [[2, 2, 2]]).deterministic).toBe(true);
  });

  it("zero-weight entries are never drawn", () => {
    const rng = mulberry32(4);
    const fixed = fixedCrowd(SMALL, [[6, 0, 0], [0, 6, 0], [0, 0, 6]], [1, 0, 0]);
    const mix = mixtureCrowd([{ weight: 0, crowd: uniformCrowd(SMALL) }, { weight: 2, crowd: pointCrowd(SMALL, [2, 2, 2]) }, { weight: 0, crowd: uniformCrowd(SMALL) }]);
    for (let i = 0; i < 500; i++) {
      expect(fixed.sample(rng)).toEqual([6, 0, 0]);
      expect(mix.sample(rng)).toEqual([2, 2, 2]);
    }
  });

  it("labels say what the crowd is", () => {
    expect(uniformCrowd(game).label).toBe("uniform");
    expect(heuristicCrowd(game, "even").label).toBe("even");
    expect(mixtureCrowd([{ weight: 3, crowd: uniformCrowd(game) }, { weight: 1, crowd: heuristicCrowd(game, "proportional") }]).label).toBe("mix of 75% uniform, 25% proportional");
  });

  it("rejects bad input with named problems", () => {
    expect(() => pointCrowd(game, [1, 2, 3])).toThrow("choice 1: allocation has 3 counts but there are 5 castles");
    expect(() => heuristicCrowd(game, "clever")).toThrow('"clever" is not a heuristic');
    expect(() => fixedCrowd(game, [])).toThrow("the list is empty");
    expect(() => fixedCrowd(SMALL, [[6, 0, 0], [0, 6, 0]], [1])).toThrow("1 weights for 2 entries");
    expect(() => fixedCrowd(SMALL, [[6, 0, 0], [0, 6, 0]], [1, -1])).toThrow("weight 2 (-1)");
    expect(() => mixtureCrowd([{ weight: 0, crowd: uniformCrowd(game) }])).toThrow("the weights sum to 0");
    expect(() => mixtureCrowd([])).toThrow("there are no parts");
  });
});

describe("crowd specs", () => {
  it("text round-trips through parse and format", () => {
    for (const text of ["uniform", "even", "fixed:15-0-41-44-0/20-20-20-20-20", "levelk:2", "levelk:1:proportional", "mix:uniform=0.5,proportional=0.3,levelk:1=0.2"]) {
      expect(formatCrowdSpec(parseCrowdSpec(text))).toBe(text);
    }
  });

  it("parses a mix into typed parts", () => {
    expect(parseCrowdSpec("mix:uniform=3,levelk:2=1")).toEqual({
      kind: "mixture",
      parts: [
        { weight: 3, crowd: { kind: "uniform" } },
        { weight: 1, crowd: { kind: "levelK", level: 2, base: { kind: "uniform" } } },
      ],
    });
  });

  it("rejects bad text with named problems", () => {
    expect(() => parseCrowdSpec("")).toThrow("crowd is empty");
    expect(() => parseCrowdSpec("levelk:4")).toThrow("the level must be an integer from 1 to 3");
    expect(() => parseCrowdSpec("levelk:0")).toThrow("the level must be an integer from 1 to 3");
    expect(() => parseCrowdSpec("mix:uniform")).toThrow("must be <crowd>=<weight>");
    expect(() => parseCrowdSpec("mix:uniform=-1")).toThrow("must be <crowd>=<weight>");
    expect(() => parseCrowdSpec("fixed:")).toThrow('fixed needs choices separated by "/"');
    expect(() => parseCrowdSpec("7 up")).toThrow("is not uniform, a heuristic name");
    expect(() => buildCrowd(game, parseCrowdSpec("clever"), QUICK)).toThrow('"clever" is not a heuristic');
    expect(() => buildCrowd(game, parseCrowdSpec("fixed:1-2-3"), QUICK)).toThrow("allocation has 3 counts but there are 5 castles");
  });

  it("builds without searching unless the spec has a level-k part", () => {
    const built = buildCrowd(game, parseCrowdSpec("mix:uniform=1,even=1"), QUICK);
    expect(built.levels.size).toBe(0);
    expect(built.crowd.label).toBe("mix of 50% uniform, 50% even");
  });

  it("searches a level-k chain once per base, to the deepest level asked for", () => {
    const built = buildCrowd(SMALL, parseCrowdSpec("mix:levelk:1=1,levelk:2=1,uniform=2"), QUICK);
    expect([...built.levels.keys()]).toEqual(["uniform"]);
    const chain = built.levels.get("uniform")!;
    expect(chain.map((l) => l.level)).toEqual([1, 2]);
    // The mixture's level parts are those very crowds.
    expect(built.crowd.label).toBe(`mix of 25% ${chain[0]!.crowd.label}, 25% ${chain[1]!.crowd.label}, 50% uniform`);
    // Building again gives the same chain: deterministic in the seed.
    expect(buildCrowd(SMALL, parseCrowdSpec("levelk:2"), QUICK).levels.get("uniform")!.map((l) => l.choice)).toEqual(chain.map((l) => l.choice));
  });
});
