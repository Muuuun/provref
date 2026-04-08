/**
 * Suggestion engine for missing keys.
 *
 * Uses Levenshtein distance to find close matches in a list of candidates.
 * Returns up to N suggestions whose distance is below a threshold (relative
 * to the query length).
 */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

export interface Suggestion {
  candidate: string;
  distance: number;
}

/**
 * Find up to `limit` candidates with edit distance ≤ `maxDistance`.
 * Sorted by distance (closest first).
 */
export function suggest(
  query: string,
  candidates: string[],
  options: { maxDistance?: number; limit?: number } = {},
): Suggestion[] {
  const limit = options.limit ?? 3;
  // Default threshold scales with query length: short queries are stricter.
  const maxDistance = options.maxDistance ?? Math.max(2, Math.floor(query.length / 3));

  const scored = candidates
    .map((c) => ({ candidate: c, distance: levenshtein(query, c) }))
    .filter((s) => s.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate));

  return scored.slice(0, limit);
}
