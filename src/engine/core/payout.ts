// Shared payout layer: every game produces raw points per player, and this module turns them into
// payouts. Raw keeps the points. Rank pays vector[r] to the player in rank r (0 = best); tied players
// share the payouts of the ranks they jointly occupy equally. Win/lose is the rank vector [1, 0, ...].

/** Raw points, or a rank payout vector (shorter than the player count: missing ranks pay 0). */
export type PayoutRule = { readonly kind: "raw" } | { readonly kind: "rank"; readonly vector: readonly number[] };

export const RAW: PayoutRule = { kind: "raw" };
export const WIN_LOSE: PayoutRule = { kind: "rank", vector: [1] };

/** Max rank vector length, and the bound on each entry's magnitude. */
export const PAYOUT_LIMITS = { maxVectorLength: 64, maxAbsEntry: 1e9 } as const;

/**
 * Points this close are a tie: |a − b| ≤ 1e-9 · max(1, |a|, |b|). Games add fractional shares
 * (a value split three ways), so exact float equality would break ties that are exact on paper.
 */
export function tied(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Problems with `rule` for a game of `players` players, as readable messages. Empty when valid. */
export function validatePayout(rule: PayoutRule, players: number): string[] {
  if (rule.kind === "raw") return [];
  const errors: string[] = [];
  const v = rule.vector;
  if (v.length === 0) errors.push("rank payout vector is empty");
  if (v.length > PAYOUT_LIMITS.maxVectorLength) errors.push(`rank payout vector has ${v.length} entries; the limit is ${PAYOUT_LIMITS.maxVectorLength}`);
  if (v.length > players) errors.push(`rank payout vector has ${v.length} entries but there are only ${players} players`);
  v.forEach((x, i) => {
    if (!Number.isFinite(x) || Math.abs(x) > PAYOUT_LIMITS.maxAbsEntry) errors.push(`rank payout entry ${i + 1} (${x}) is not a finite number within ±${PAYOUT_LIMITS.maxAbsEntry}`);
  });
  return errors;
}

/** Payout per player from points, with tie splitting. Does not mutate `points`. */
export function rankPayouts(points: readonly number[], vector: readonly number[]): number[] {
  const n = points.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => points[b]! - points[a]!);
  const out = new Array<number>(n).fill(0);
  let r = 0;
  while (r < n) {
    // The group of players tied with the first one at rank r occupies ranks r .. end - 1.
    const lead = points[order[r]!]!;
    let end = r + 1;
    while (end < n && tied(points[order[end]!]!, lead)) end++;
    let sum = 0;
    for (let k = r; k < end; k++) sum += vector[k] ?? 0;
    const share = sum / (end - r);
    for (let k = r; k < end; k++) out[order[k]!] = share;
    r = end;
  }
  return out;
}

export function applyPayout(rule: PayoutRule, points: readonly number[]): number[] {
  return rule.kind === "raw" ? points.slice() : rankPayouts(points, rule.vector);
}

/** True when `seat` has strictly more points than every other player (no tie for first). */
export function isOutrightFirst(points: readonly number[], seat: number): boolean {
  const p = points[seat]!;
  for (let j = 0; j < points.length; j++) {
    if (j !== seat && (points[j]! > p || tied(points[j]!, p))) return false;
  }
  return true;
}

/** Parses "winlose", "raw" or "rank:9,4,2,0". Throws an Error naming the problem. */
export function parsePayout(text: string): PayoutRule {
  const t = text.trim().toLowerCase();
  if (t === "winlose") return WIN_LOSE;
  if (t === "raw") return RAW;
  if (t.startsWith("rank:")) {
    const parts = t.slice(5).split(",");
    const vector = parts.map((p, i) => {
      const x = p.trim() === "" ? NaN : Number(p);
      if (!Number.isFinite(x)) throw new Error(`rank payout entry ${i + 1} ("${p}") is not a number`);
      return x;
    });
    return { kind: "rank", vector };
  }
  throw new Error(`payout "${text}" is not one of winlose, raw, or rank:<comma-separated payouts> such as rank:9,4,2,0`);
}

/** Inverse of parsePayout. A rank vector of 1 followed only by zeros prints as "winlose". */
export function formatPayout(rule: PayoutRule): string {
  if (rule.kind === "raw") return "raw";
  const v = rule.vector;
  if (v[0] === 1 && v.slice(1).every((x) => x === 0)) return "winlose";
  return `rank:${v.join(",")}`;
}
