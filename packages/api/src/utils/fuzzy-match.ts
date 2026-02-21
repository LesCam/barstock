/**
 * Lightweight fuzzy string matching for inventory item / recipe name lookups.
 * No external dependencies — inventory lists are small enough for O(n) scans.
 */

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (è→e, ñ→n, etc.)
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface FuzzyResult<T> {
  item: T;
  score: number;
  label: string;
}

/**
 * Fuzzy match a query against a list of candidates.
 *
 * Scoring tiers:
 *  - Exact normalized match → 1.0
 *  - Candidate starts with query → 0.9
 *  - Candidate contains query → 0.8
 *  - Jaccard token overlap → 0–0.7
 */
export function fuzzyMatch<T>(
  query: string,
  candidates: T[],
  getLabel: (item: T) => string,
  threshold = 0.3,
): FuzzyResult<T>[] {
  const normQuery = normalize(query);
  if (!normQuery) return [];
  const queryTokens = tokenize(query);

  const results: FuzzyResult<T>[] = [];

  for (const item of candidates) {
    const label = getLabel(item);
    const normLabel = normalize(label);

    let score: number;
    if (normLabel === normQuery) {
      score = 1.0;
    } else if (normLabel.startsWith(normQuery)) {
      score = 0.9;
    } else if (normLabel.includes(normQuery)) {
      score = 0.8;
    } else {
      const labelTokens = tokenize(label);
      score = jaccardSimilarity(queryTokens, labelTokens) * 0.7;
    }

    if (score >= threshold) {
      results.push({ item, score, label });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Find the single best match above threshold, or null.
 */
export function bestMatch<T>(
  query: string,
  candidates: T[],
  getLabel: (item: T) => string,
  threshold = 0.3,
): FuzzyResult<T> | null {
  const results = fuzzyMatch(query, candidates, getLabel, threshold);
  return results[0] ?? null;
}
