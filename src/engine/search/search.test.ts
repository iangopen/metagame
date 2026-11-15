import { describe, expect, it } from "vitest";
import { deriveSeed } from "../core/seeds";
import { pointCrowd, uniformCrowd } from "../crowds/crowd";
import { evaluateChoices } from "../eval/play";
import { blottoParams } from "../games/blotto/blotto";
import { blottoGame } from "../games/blotto/blottoGame";
import { search, SEARCH_DEFAULTS, SEARCH_PRESETS } from "./search";

const game = blottoGame(blottoParams());
const crowd = uniformCrowd(game);
const SMALL = { samples: 24, screenRounds: 100, starts: 3, climbRounds: 400, climbSteps: 25, finalists: 5, finalRounds: 1500, holdoutRounds: 1500 };

describe("search: determinism and bookkeeping", () => {
  const r = search(game, crowd, { seed: 4, ...SMALL });

  it("the same inputs give the same result, field for field", () => {
    expect(search(game, crowd, { seed: 4, ...SMALL })).toEqual(r);
  });

  it("a different seed draws a different pool", () => {
    expect(search(game, crowd, { seed: 5, ...SMALL }).searchEstimate.mean).not.toBe(r.searchEstimate.mean);
  });

  it("finalists are distinct, sorted best first, and the best found is the first", () => {
    const keys = r.finalists.map((f) => game.encode(f.choice));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(SMALL.finalists);
    for (let i = 1; i < r.finalists.length; i++) expect(r.finalists[i]!.search.mean).toBeLessThanOrEqual(r.finalists[i - 1]!.search.mean);
    expect(r.best).toEqual(r.finalists[0]!.choice);
    expect(r.searchEstimate).toEqual(r.finalists[0]!.search);
  });

  it("the finalists' search estimates are plain evaluations on the search seed", () => {
    const direct = evaluateChoices(game, crowd, r.finalists.map((f) => f.choice), { rounds: SMALL.finalRounds, seed: 4 });
    expect(direct.evaluations.map((e) => e.payout)).toEqual(r.finalists.map((f) => f.search));
  });

  it("the held-out numbers are plain evaluations on the held-out seed, which is not the search seed", () => {
    expect(r.holdoutSeed).toBe(deriveSeed(4, "holdout", 0));
    expect(r.holdoutSeed).not.toBe(4);
    const direct = evaluateChoices(game, crowd, [r.best, r.runnerUp!.choice], { rounds: SMALL.holdoutRounds, seed: r.holdoutSeed }, 1);
    expect(r.holdout).toEqual(direct.evaluations[0]);
    expect(r.runnerUp!.holdout).toEqual(direct.evaluations[1]);
    expect(r.runnerUp!.diff).toEqual(direct.diffs![0]);
    expect(r.runnerUp!.choice).toEqual(r.finalists[1]!.choice);
  });

  it("counts its cost and reports the settings it ran with", () => {
    expect(r.settings).toEqual({ ...SEARCH_DEFAULTS, ...SMALL });
    expect(r.exhaustive).toBe(false);
    expect(r.exact).toBe(false);
    expect(r.poolSize).toBe(24);
    // Screening 24 → 12 → 6 → 3 at 100, 200, 400 rounds; at most 3 · 26 climb values; 5 finalists; 2 held out.
    const screening = 24 * 100 + 12 * 200 + 6 * 400;
    expect(r.scorings).toBeGreaterThan(screening + 5 * 1500 + 2 * 1500);
    expect(r.scorings).toBeLessThanOrEqual(screening + 3 * 26 * 400 + 5 * 1500 + 2 * 1500);
  });
});

describe("search: pool and options", () => {
  it("with no samples and no climbing the best found comes from the included choices", () => {
    const include = [[20, 20, 20, 20, 20], [0, 0, 17, 34, 49], [100, 0, 0, 0, 0]];
    const r = search(game, crowd, { seed: 1, ...SMALL, samples: 0, climbSteps: 0, include });
    expect(r.best).toEqual([0, 0, 17, 34, 49]);
    expect(r.finalists.map((f) => f.choice)).toEqual([[0, 0, 17, 34, 49], [20, 20, 20, 20, 20], [100, 0, 0, 0, 0]]);
    expect(r.poolSize).toBe(3);
  });

  it("a repeated included choice is pooled once", () => {
    const r = search(game, crowd, { seed: 1, ...SMALL, samples: 0, climbSteps: 0, include: [[20, 20, 20, 20, 20], [20, 20, 20, 20, 20]] });
    expect(r.poolSize).toBe(1);
    expect(r.runnerUp).toBeNull();
  });

  it("a small game is searched exhaustively", () => {
    const small = blottoGame(blottoParams({ castleValues: [1, 2, 3], soldiers: 6 }));
    const r = search(small, uniformCrowd(small), { seed: 1, ...SMALL });
    expect(r.exhaustive).toBe(true);
    expect(r.poolSize).toBe(28);
    expect(search(small, uniformCrowd(small), { seed: 1, ...SMALL, exhaustiveLimit: 0 }).exhaustive).toBe(false);
  });

  it("against a point crowd the rounds collapse and the estimates are exact", () => {
    const r = search(game, pointCrowd(game, [20, 20, 20, 20, 20]), { seed: 1 });
    expect(r.exact).toBe(true);
    expect(r.settings.finalRounds).toBe(2);
    expect(r.holdout.payout.mean).toBe(1); // some allocation beats an even split outright
    expect(r.holdout.payout.se).toBe(0);
    expect(game.score([r.best, [20, 20, 20, 20, 20]], () => 0).payouts[0]).toBe(1);
  });

  it("presets are valid settings", () => {
    for (const preset of Object.values(SEARCH_PRESETS)) expect(() => search(game, pointCrowd(game, [20, 20, 20, 20, 20]), { seed: 1, ...preset })).not.toThrow();
    expect(SEARCH_PRESETS.standard).toBe(SEARCH_DEFAULTS);
  });

  it("rejects bad input with named problems", () => {
    expect(() => search(game, crowd, { seed: -1 })).toThrow("seed is -1");
    expect(() => search(game, crowd, { seed: 1, eta: 1 })).toThrow("eta is 1; it must be an integer from 2 to 16");
    expect(() => search(game, crowd, { seed: 1, starts: 0 })).toThrow("starts is 0");
    expect(() => search(game, crowd, { seed: 1, finalRounds: 1 })).toThrow("finalRounds is 1");
    expect(() => search(game, crowd, { seed: 1, samples: 0 })).toThrow("the pool is empty");
    expect(() => search(game, crowd, { seed: 1, include: [[1, 2, 3]] })).toThrow("include 1: allocation has 3 counts but there are 5 castles");
  });
});
