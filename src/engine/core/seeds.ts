// Named seed streams. Not part of StrategyLab: its sessionSeed(master, i) derives one stream per
// index, and this repo needs several independent streams per round ("crowd", "game", ...). Built
// on top of the copied rng.ts rather than editing it.

import { mulberry32, sessionSeed, splitmix32, type Rng } from "./rng";

/** FNV-1a 32-bit hash of a label's UTF-16 code units, finalized by splitmix32. */
export function labelHash(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return splitmix32(h >>> 0);
}

/**
 * Seed for stream `label`, index `i`, under `masterSeed`: sessionSeed(masterSeed ^ labelHash(label), i).
 * Different labels give unrelated streams for the same (masterSeed, i); never masterSeed + i.
 */
export function deriveSeed(masterSeed: number, label: string, i: number): number {
  return sessionSeed((masterSeed ^ labelHash(label)) >>> 0, i);
}

/** A mulberry32 stream seeded by deriveSeed(masterSeed, label, i). */
export function deriveRng(masterSeed: number, label: string, i: number): Rng {
  return mulberry32(deriveSeed(masterSeed, label, i));
}

/** Uniform integer in [0, n). n must be a positive integer below 2^32. */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}
