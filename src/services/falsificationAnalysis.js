/**
 * Security analysis utilities for falsification probability.
 * Single-hash case (m = 0) for now; Merkle batching to follow.
 */

/**
 * Default number of hash bits for Keccak-256.
 * @type {number}
 */
export const DEFAULT_HASH_BITS = 256;

/**
 * Compute the Merkle path length for a batch of size N.
 * For now we anchor single items directly (no Merkle), so m = 0.
 *
 * TODO: When adopting Merkle batching, set m = ceil(log2(N)).
 * @param {number} N
 * @returns {number}
 */
export function pathLengthForBatch(N) {
  void N; // unused until Merkle batching is adopted
  return 0;
}

/**
 * Exact falsification probability given hash bits b and path length m.
 * Derived from the probability of at least one collision across (m+1) independent hashes:
 *   P = 1 - (1 - 2^-b)^(m+1)
 * For m = 0, reduces to 2^-b.
 * @param {number} b - hash bits (e.g., 256)
 * @param {number} m - path length (number of internal nodes along the proof)
 * @returns {number}
 */
export function exactFalsificationProbability(b, m) {
  const bits = Math.max(0, Number(b) | 0);
  const path = Math.max(0, Number(m) | 0);
  const p = 2 ** -bits;
  const trials = path + 1;
  if (trials === 1) {
    // Avoid catastrophic cancellation for m = 0
    return p;
  }
  if (p === 0) return 0;
  // Numerically stable: 1 - (1 - p)^(trials) = -expm1(trials * log1p(-p))
  const value = -Math.expm1(trials * Math.log1p(-p));
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Large-b approximation of falsification probability:
 *   P ≈ (m + 1) / 2^b
 * For m = 0, reduces to 2^-b.
 * @param {number} b - hash bits (e.g., 256)
 * @param {number} m - path length
 * @returns {number}
 */
export function approxFalsificationProbability(b, m) {
  const bits = Math.max(0, Number(b) | 0);
  const path = Math.max(0, Number(m) | 0);
  const value = (path + 1) * 2 ** -bits;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Summarize falsification probabilities for given parameters.
 * @param {{ b?: number, N?: number }} params
 * @returns {{ b: number, N: number, m: number, exact: number, approx: number }}
 */
export function summarizeFalsification({ b = DEFAULT_HASH_BITS, N = 1 } = {}) {
  const m = pathLengthForBatch(N);
  return {
    b,
    N,
    m,
    exact: exactFalsificationProbability(b, m),
    approx: approxFalsificationProbability(b, m),
  };
}
