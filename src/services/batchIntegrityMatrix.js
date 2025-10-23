import { normalizeHash } from "../utils/hash.js";
import {
  deriveBatchPayloadFromRecord,
  buildBatchCanonicalPayload,
  computeBatchHashFromCanonical,
} from "./batchIntegrityService.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { fetchBatchOnChain } from "../eth/batchContract.js";

/**
 * @typedef {Object} BatchRow
 * @property {string} id
 * @property {string|null} batch_hash
 * @property {string|null} tx_hash
 * @property {string|null} pinata_cid
 */

/**
 * Compute integrity verdict for a single batch row.
 * @param {BatchRow} row
 * @returns {Promise<{
 *  id: string,
 *  onChain: 'MATCH' | 'MISMATCH' | 'MISSING',
 *  dbHash: 'MATCH' | 'MISMATCH',
 *  batchHash: string|null,
 *  dbCanonicalHash: string,
 *  onChainHash: string|null,
 *  txHash: string|null,
 *  pinataCid: string|null,
 * }>} 
 */
export async function computeBatchIntegrityForRow(row) {
  const { id, batch_hash, tx_hash, pinata_cid } = row;

  const normalizedPayload = deriveBatchPayloadFromRecord(row);
  const canonical = buildBatchCanonicalPayload(id, normalizedPayload);
  const dbCanonicalHash = normalizeHash(
    computeBatchHashFromCanonical(canonical)
  );

  const stored = batch_hash ? normalizeHash(batch_hash) : null;
  const dbHash = stored && stored === dbCanonicalHash ? "MATCH" : "MISMATCH";

  let onChain = "MISSING";
  let onChainHash = null;
  try {
    const onChainMeta = await fetchBatchOnChain(uuidToBytes16Hex(id));
    if (onChainMeta && onChainMeta.hash) {
      onChainHash = normalizeHash(onChainMeta.hash);
      onChain = onChainHash === dbCanonicalHash ? "MATCH" : "MISMATCH";
    }
  } catch (_err) {
    // conservative default remains MISSING
  }

  return {
    id,
    onChain,
    dbHash,
    batchHash: batch_hash ?? null,
    dbCanonicalHash,
    onChainHash,
    txHash: tx_hash ?? null,
    pinataCid: pinata_cid ?? null,
  };
}

/**
 * Build integrity matrix for batch rows.
 * @param {BatchRow[]} rows
 */
export async function buildBatchIntegrityMatrix(rows) {
  return Promise.all(rows.map((r) => computeBatchIntegrityForRow(r)));
}

