import { describe, expect, it } from "vitest";
import { fixedCrowd, mixtureCrowd, pointCrowd, uniformCrowd } from "../crowds/crowd";
import { evaluateChoice } from "../eval/play";
import { blottoParams } from "../games/blotto/blotto";
import { blottoGame } from "../games/blotto/blottoGame";
import { robustness } from "./robustness";

const game = blottoGame(blottoParams({ castleValues: [1, 2, 3], soldiers: 6 }));

describe("robustness, hand-worked on point crowds (castles 1, 2, 3; 6 soldiers; win/lose)", () => {
  // A = 0-0-6, B = 0-3-3. Crowd X plays 2-2-2, crowd Y plays 0-0-6.
  //   A vs X: A takes castle 3 (3 points), X takes 1 and 2 (3 points): tie, 0.5.
  //   B vs X: B takes castles 2 and 3 (5 points) to 1: win, 1.
  //   A vs Y: identical, every castle tied: 0.5.
  //   B vs Y: castle 1 tied (0.5 each), B takes 2, Y takes 3: 2.5 to 3.5: loss, 0.
  const A = [0, 0, 6];
  const B = [0, 3, 3];
  const r = robustness(game, [A, B], [pointCrowd(game, [2, 2, 2]), pointCrowd(game, [0, 0, 6])], { rounds: 50, seed: 1 });

  it("the matrix is [[0.5, 0.5], [1, 0]]", () => {
    expect(r.cells.map((row) => row.map((e) => e.payout.mean))).toEqual([[0.5, 0.5], [1, 0]]);
  });

  it("B is best against X, A against Y, and regret is the gap to that best", () => {
    expect(r.best).toEqual([1, 0]);
    expect(r.regret.map((row) => row.map((d) => d.mean))).toEqual([[0.5, 0], [0, 0.5]]);
  });

  it("A has the better worst case; both give up 0.5 somewhere, so the first listed is named", () => {
    expect(r.strategies[0]).toEqual({ worstCrowd: 0, worstPayout: 0.5, maxRegretCrowd: 0, maxRegret: 0.5 });
    expect(r.strategies[1]).toEqual({ worstCrowd: 1, worstPayout: 0, maxRegretCrowd: 1, maxRegret: 0.5 });
    expect(r.bestWorstCase).toBe(0);
    expect(r.smallestMaxRegret).toBe(0);
  });
});

describe("robustness against sampled crowds", () => {
  const strategies = [[0, 0, 6], [0, 1, 5], [2, 2, 2], [1, 2, 3]];
  const crowds = [uniformCrowd(game), fixedCrowd(game, [[2, 2, 2], [1, 2, 3], [0, 3, 3]]), mixtureCrowd([{ weight: 1, crowd: uniformCrowd(game) }, { weight: 1, crowd: pointCrowd(game, [0, 0, 6]) }])];
  const opts = { rounds: 4000, seed: 3 };
  const r = robustness(game, strategies, crowds, opts);

  it("every cell is the evaluation of that strategy against that crowd under the same seed", () => {
    strategies.forEach((s, i) => crowds.forEach((c, j) => expect(r.cells[i]![j]).toEqual(evaluateChoice(game, c, s, opts))));
  });

  it("regret is the paired gap to the best listed strategy: 0 for the best, never negative", () => {
    crowds.forEach((_, j) => {
      const means = strategies.map((_, i) => r.cells[i]![j]!.payout.mean);
      const b = r.best[j]!;
      expect(means[b]).toBe(Math.max(...means));
      expect(r.regret[b]![j]!.mean).toBe(0);
      expect(r.regret[b]![j]!.se).toBe(0);
      strategies.forEach((_, i) => {
        const d = r.regret[i]![j]!;
        expect(d.mean).toBeCloseTo(means[b]! - means[i]!, 12);
        expect(d.mean).toBeGreaterThanOrEqual(0);
        expect(d.low).toBeLessThanOrEqual(d.mean);
        expect(d.high).toBeGreaterThanOrEqual(d.mean);
      });
    });
  });

  it("the summaries point at the cells they summarise", () => {
    r.strategies.forEach((s, i) => {
      expect(s.worstPayout).toBe(Math.min(...r.cells[i]!.map((e) => e.payout.mean)));
      expect(s.worstPayout).toBe(r.cells[i]![s.worstCrowd]!.payout.mean);
      expect(s.maxRegret).toBe(Math.max(...r.regret[i]!.map((d) => d.mean)));
      expect(s.maxRegret).toBe(r.regret[i]![s.maxRegretCrowd]!.mean);
    });
    expect(r.strategies[r.bestWorstCase]!.worstPayout).toBe(Math.max(...r.strategies.map((s) => s.worstPayout)));
    expect(r.strategies[r.smallestMaxRegret]!.maxRegret).toBe(Math.min(...r.strategies.map((s) => s.maxRegret)));
  });

  it("rejects empty or oversized input", () => {
    expect(() => robustness(game, [], crowds, opts)).toThrow("there are 0 strategies");
    expect(() => robustness(game, strategies, [], opts)).toThrow("there are 0 crowds");
    expect(() => robustness(game, [[1, 2, 4]], crowds, opts)).toThrow("candidate 1: allocation uses 7 soldiers");
  });
});
