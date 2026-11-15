import { describe, expect, it } from "vitest";
import { parsePayout } from "../core/payout";
import { fixedCrowd, mixtureCrowd, pointCrowd, uniformCrowd } from "../crowds/crowd";
import { blottoParams } from "../games/blotto/blotto";
import { blottoGame } from "../games/blotto/blottoGame";
import { evaluate } from "./evaluate";
import { compareChoices, drawRounds, evaluateChoice, evaluateChoices, meanPayoutOn } from "./play";

const P4 = blottoParams({ players: 4, payout: parsePayout("rank:9,4,2,0") });
const game = blottoGame(P4);
const A = [15, 0, 41, 44, 0];
const B = [0, 22, 1, 77, 0];
const C = [20, 20, 20, 20, 20];
const MIX = mixtureCrowd([{ weight: 2, crowd: uniformCrowd(game) }, { weight: 1, crowd: fixedCrowd(game, [A, B, C]) }]);

describe("evaluation against any crowd", () => {
  it("the Blotto evaluate() is evaluateChoice against the uniform crowd", () => {
    expect(evaluate(P4, A, { rounds: 2000, seed: 5 })).toEqual(evaluateChoice(game, uniformCrowd(game), A, { rounds: 2000, seed: 5 }));
  });

  it("a candidate's result does not depend on which other candidates are evaluated with it", () => {
    const alone = evaluateChoice(game, MIX, A, { rounds: 3000, seed: 7 });
    const many = evaluateChoices(game, MIX, [B, A, C], { rounds: 3000, seed: 7 });
    expect(many.evaluations[1]).toEqual(alone);
    expect(many.diffs).toBeNull();
  });

  it("paired differences are taken against the reference candidate on the same rounds", () => {
    const r = evaluateChoices(game, MIX, [A, B, C], { rounds: 3000, seed: 7 }, 2);
    expect(r.diffs![2]!.mean).toBe(0);
    expect(r.diffs![2]!.se).toBe(0);
    expect(r.diffs![0]!.mean).toBeCloseTo(r.evaluations[0]!.payout.mean - r.evaluations[2]!.payout.mean, 12);
    const c = compareChoices(game, MIX, A, C, { rounds: 3000, seed: 7 });
    expect(c.diff).toEqual(r.diffs![0]);
    expect(() => evaluateChoices(game, MIX, [A, B], { rounds: 100, seed: 1 }, 2)).toThrow("reference is 2");
  });

  it("a drawn round set gives the same mean, bit for bit, as the streaming evaluation", () => {
    for (const crowd of [uniformCrowd(game), MIX, pointCrowd(game, C)]) {
      const set = drawRounds(game, crowd, { rounds: 1500, seed: 11 });
      expect(set.opponents).toHaveLength(1500);
      expect(set.opponents[0]).toHaveLength(3);
      for (const x of [A, B, C]) expect(meanPayoutOn(game, set, x)).toBe(evaluateChoice(game, crowd, x, { rounds: 1500, seed: 11 }).payout.mean);
    }
  });

  it("against a point crowd every round is the same round", () => {
    // Four players all on 20-20-20-20-20 tie everywhere: rank payouts 9, 4, 2, 0 split four ways.
    const e = evaluateChoice(game, pointCrowd(game, C), C, { rounds: 500, seed: 1 });
    expect(e.payout.mean).toBe(3.75);
    expect(e.payout.se).toBe(0);
    expect(e.firstPlace.count).toBe(0);
  });
});
