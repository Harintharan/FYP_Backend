import { keccak256, toUtf8Bytes } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import { normalizeHash } from "../utils/hash.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { registry } from "../eth/contract.js";

/**
 * @typedef {Object} RegistrationRow
 * @property {string} id - Registration UUID (string form)
 * @property {object} payload - Original payload object
 * @property {string|null} [payload_hash] - Stored DB payload hash (hex)
 * @property {string|null} [tx_hash] - On-chain tx hash (if any)
 * @property {string|null} [pinata_cid] - Pinata CID (if any)
 * @property {string|null} [payload_canonical] - Canonical string (optional; not required here)
 */

/**
 * Compute integrity verdict for a single registration row, comparing
 * DB-computed canonical hash vs stored DB hash and the on-chain hash.
 *
 * - Recomputes keccak256(stableStringify(payload)) as dbCanonicalHash
 * - Compares dbCanonicalHash vs row.payload_hash (DB column)
 * - Fetches on-chain tuple for uuid and compares onChainHash vs dbCanonicalHash
 * - Does not call external Pinata; only reports CID if present
 *
 * @param {RegistrationRow} row
 * @returns {Promise<{
 *   id: string,
 *   onChain: "MATCH"|"MISMATCH"|"MISSING",
 *   dbHash: "MATCH"|"MISMATCH",
 *   payloadHash: string|null,
 *   dbCanonicalHash: string,
 *   onChainHash: string|null,
 *   txHash: string|null,
 *   pinataCid: string|null,
 * }>} verdict
 */
export async function computeIntegrityForRow(row) {
  const { id, payload, payload_hash, tx_hash, pinata_cid } = row;

  const canonicalFromPayload = stableStringify(payload);
  const dbCanonicalHash = normalizeHash(keccak256(toUtf8Bytes(canonicalFromPayload)));

  const storedHash = payload_hash ? normalizeHash(payload_hash) : null;
  const dbHash = storedHash && storedHash === dbCanonicalHash ? "MATCH" : "MISMATCH";

  let onChain = "MISSING";
  let onChainHash = null;

  try {
    const uuidBytes16 = uuidToBytes16Hex(id);
    const exists = await registry.exists(uuidBytes16);
    if (exists) {
      const onChainTuple = await registry.getRegistration(uuidBytes16);
      const chainHash = normalizeHash(onChainTuple.payloadHash ?? onChainTuple[0]);
      onChainHash = chainHash;
      onChain = chainHash === dbCanonicalHash ? "MATCH" : "MISMATCH";
    }
  } catch (_err) {
    // Swallow errors and keep onChain = "MISSING" for a conservative report.
  }

  return {
    id,
    onChain,
    dbHash,
    payloadHash: payload_hash ?? null,
    dbCanonicalHash,
    onChainHash,
    txHash: tx_hash ?? null,
    pinataCid: pinata_cid ?? null,
  };
}

/**
 * Build integrity matrix for a list of rows.
 * @param {RegistrationRow[]} rows
 * @returns {Promise<ReturnType<typeof computeIntegrityForRow>[]>}
 */
export async function buildIntegrityMatrix(rows) {
  return Promise.all(rows.map((row) => computeIntegrityForRow(row)));
}

// TODO: When switching to batched Merkle-root anchoring, extend computeIntegrityForRow
// to produce Merkle proofs per registration: { leaf, path: [], root }, where `path`
// contains sibling hashes and positions needed to verify the proof against the root.

