import { describe, expect, it } from "vitest";
import { deriveRng, deriveSeed, labelHash } from "./seeds";
import { sessionSeed } from "./rng";

describe("deriveSeed", () => {
  it("is deterministic and follows sessionSeed(master ^ labelHash(label), i)", () => {
    expect(deriveSeed(7, "crowd", 3)).toBe(deriveSeed(7, "crowd", 3));
    expect(deriveSeed(7, "crowd", 3)).toBe(sessionSeed((7 ^ labelHash("crowd")) >>> 0, 3));
    expect(deriveRng(7, "game", 9)()).toBe(deriveRng(7, "game", 9)());
  });

  it("labels, indices and master seeds all give distinct seeds", () => {
    const seen = new Set<number>();
    for (const label of ["crowd", "game", "search"]) {
      for (const master of [0, 1, 2]) {
        for (let i = 0; i < 1000; i++) seen.add(deriveSeed(master, label, i));
      }
    }
    expect(seen.size).toBe(9000);
    expect(deriveSeed(1, "crowd", 0)).not.toBe(deriveSeed(1, "game", 0));
  });
});
