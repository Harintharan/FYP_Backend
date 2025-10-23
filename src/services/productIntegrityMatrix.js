import { normalizeHash } from "../utils/hash.js";
import {
  deriveProductPayloadFromRecord,
  buildProductCanonicalPayload,
  computeProductHashFromCanonical,
} from "./productIntegrityService.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { fetchProductOnChain } from "../eth/productContract.js";

/**
 * @typedef {Object} ProductRow
 * @property {string} id
 * @property {string|null} product_hash
 * @property {string|null} tx_hash
 * @property {string|null} pinata_cid
 * // any other fields used by deriveProductPayloadFromRecord
 */

/**
 * Compute integrity verdict for a single product row.
 * @param {ProductRow} row
 * @returns {Promise<{
 *  id: string,
 *  onChain: 'MATCH' | 'MISMATCH' | 'MISSING',
 *  dbHash: 'MATCH' | 'MISMATCH',
 *  productHash: string|null,
 *  dbCanonicalHash: string,
 *  onChainHash: string|null,
 *  txHash: string|null,
 *  pinataCid: string|null,
 * }>} 
 */
export async function computeProductIntegrityForRow(row) {
  const { id, product_hash, tx_hash, pinata_cid } = row;

  // Reconstruct normalized payload from DB row
  const normalizedPayload = deriveProductPayloadFromRecord(row);
  const canonical = buildProductCanonicalPayload(id, normalizedPayload);
  const dbCanonicalHash = normalizeHash(computeProductHashFromCanonical(canonical));

  const storedHash = product_hash ? normalizeHash(product_hash) : null;
  const dbHash = storedHash && storedHash === dbCanonicalHash ? "MATCH" : "MISMATCH";

  let onChain = "MISSING";
  let onChainHash = null;
  try {
    const onChainMeta = await fetchProductOnChain(uuidToBytes16Hex(id));
    if (onChainMeta && onChainMeta.hash) {
      onChainHash = normalizeHash(onChainMeta.hash);
      onChain = onChainHash === dbCanonicalHash ? "MATCH" : "MISMATCH";
    }
  } catch (_err) {
    // conservative: keep MISSING
  }

  return {
    id,
    onChain,
    dbHash,
    productHash: product_hash ?? null,
    dbCanonicalHash,
    onChainHash,
    txHash: tx_hash ?? null,
    pinataCid: pinata_cid ?? null,
  };
}

/**
 * Build integrity matrix for product rows.
 * @param {ProductRow[]} rows
 */
export async function buildProductIntegrityMatrix(rows) {
  return Promise.all(rows.map((r) => computeProductIntegrityForRow(r)));
}

