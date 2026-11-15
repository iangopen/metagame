import { describe, expect, it } from "vitest";
import { RAW } from "../../core/payout";
import { mulberry32 } from "../../core/rng";
import { guessGame, guessParams, scoreGuessRound, validateGuessParams } from "./guess";

describe("guess 2/3 scoring, hand-worked", () => {
  it("three players at 0, 50 and 100: the target is 33.33 and 50 is closest", () => {
    // Mean 50, target 2/3 · 50 = 33.33. Distances: 33.33, 16.67, 66.67.
    const r = scoreGuessRound(guessParams(), [0, 50, 100]);
    expect(r.points[0]).toBeCloseTo(-100 / 3, 12);
    expect(r.points[1]).toBeCloseTo(-50 / 3, 12);
    expect(r.points[2]).toBeCloseTo(-200 / 3, 12);
    expect(r.payouts).toEqual([0, 1, 0]);
  });

  it("the candidate's own number moves the target", () => {
    // Two players at 30 and 60: mean 45, target 30. The player at 30 is exactly on it.
    const r = scoreGuessRound(guessParams({ players: 2, payout: RAW }), [30, 60]);
    expect(r.payouts[0]).toBeCloseTo(0, 12);
    expect(r.payouts[1]).toBeCloseTo(-30, 12);
  });

  it("equal numbers tie and split the win", () => {
    expect(scoreGuessRound(guessParams({ players: 2 }), [10, 10]).payouts).toEqual([0.5, 0.5]);
  });

  it("with two players the lower number always wins", () => {
    for (const [a, b] of [[0, 1], [10, 90], [65, 66]] as const) expect(scoreGuessRound(guessParams({ players: 2 }), [a, b]).payouts).toEqual([1, 0]);
  });
});

describe("guess 2/3 as a game", () => {
  const game = guessGame(guessParams());

  it("has 101 choices, enumerated in order", () => {
    expect(game.choiceCount).toBe(101);
    expect(game.enumerate()).toEqual(Array.from({ length: 101 }, (_, i) => i));
  });

  it("neighbour stays in range, within 10, and never returns its input", () => {
    const rng = mulberry32(5);
    const reached = new Set<number>();
    for (const x of [0, 3, 50, 97, 100]) {
      for (let i = 0; i < 2000; i++) {
        const y = game.neighbour(x, rng);
        expect(game.validate(y)).toEqual([]);
        expect(y).not.toBe(x);
        expect(Math.abs(y - x)).toBeLessThanOrEqual(10);
        if (x === 50) reached.add(y);
      }
    }
    expect(reached.size).toBe(20); // 40 .. 60 without 50
  });

  it("encode and decode round-trip, and bad input is named", () => {
    expect(game.decode(game.encode(42))).toBe(42);
    expect(() => game.decode("101")).toThrow("guess is 101; it must be an integer from 0 to 100");
    expect(() => game.decode("4.5")).toThrow("not a non-negative integer");
    expect(validateGuessParams(guessParams({ factor: 1 }))).toEqual(["factor is 1; it must be above 0 and below 1"]);
    expect(() => guessGame(guessParams({ players: 1 }))).toThrow("players is 1");
  });
});
