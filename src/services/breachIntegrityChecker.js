/**
 * Breach Integrity Checker Service
 * Verifies that condition breach records haven't been tampered with
 */

import {
  deriveConditionBreachPayloadFromRecord,
  prepareConditionBreachPersistence,
  computeConditionBreachHashFromCanonical,
  normalizeConditionBreachPayload,
} from "./conditionBreachIntegrityService.js";

/**
 * Verify a single breach record's integrity
 * @param {Object} breachRecord - The breach record from database
 * @returns {Object} Verification result with isValid, status, hashes
 */
export async function verifyBreachIntegrity(breachRecord) {
  console.log("Step 1");
  console.log("BreachRecord", breachRecord);

  if (!breachRecord || (!breachRecord.id && !breachRecord.breach_uuid)) {
    console.log("Step 3");
    return {
      isValid: false,
      status: "VERIFICATION_FAILED",
      error: "Invalid or missing breach record",
    };
  }

  try {
    console.log("Step 4");
    // Skip verification if no stored hash
    if (!breachRecord.payload_hash) {
      console.log("Step 5");
      return {
        isValid: null,
        status: "NO_HASH_STORED",
        breachId: breachRecord.id,
        message: "No hash available for verification",
      };
    }

    console.log("Step 2");

    // Reconstruct payload from current row data
    const payload = deriveConditionBreachPayloadFromRecord(breachRecord);
    // CRITICAL: Normalize the payload the same way it was during save
    // This ensures empty strings from DB (stored as false/null) are handled consistently
    const normalizedPayload = normalizeConditionBreachPayload(payload);

    const { payloadHash: computed, canonical } =
      prepareConditionBreachPersistence(breachRecord.id, normalizedPayload);

    const stored = breachRecord.payload_hash;
    const isValid = computed === stored;

    // Detailed debugging for all records, focusing on DOOR_TAMPER issues
    if (breachRecord.breach_type === "DOOR_TAMPER" || !isValid) {
      console.log(
        `\n🔍 DETAILED DEBUG for ${breachRecord.breach_type} breach ${breachRecord.id}:`
      );
      console.log("📊 RAW DATABASE VALUES:");
      console.log("  breach_type:", breachRecord.breach_type);
      console.log("  notes:", JSON.stringify(breachRecord.notes));
      console.log(
        "  has_data_gaps:",
        breachRecord.has_data_gaps,
        `(type: ${typeof breachRecord.has_data_gaps})`
      );
      console.log(
        "  total_gap_duration_seconds:",
        breachRecord.total_gap_duration_seconds
      );
      console.log("  gap_details:", breachRecord.gap_details);

      console.log("\n🔧 RECONSTRUCTED PAYLOAD:");
      console.log("  Object.keys(payload):", Object.keys(payload));
      console.log(
        "  hasDataGaps:",
        payload.hasDataGaps,
        `(type: ${typeof payload.hasDataGaps})`
      );
      console.log("  notes:", JSON.stringify(payload.notes));

      console.log("\n✨ NORMALIZED PAYLOAD:");
      console.log(
        "  Object.keys(normalizedPayload):",
        Object.keys(normalizedPayload)
      );
      console.log(
        "  hasDataGaps:",
        JSON.stringify(normalizedPayload.hasDataGaps)
      );
      console.log("  notes:", JSON.stringify(normalizedPayload.notes));

      console.log("\n📝 CANONICAL JSON:");
      console.log(canonical);

      if (!isValid) {
        console.log("\n❌ HASH COMPARISON:");
        console.log("  stored: ", stored);
        console.log("  computed:", computed);
      } else {
        console.log("\n✅ HASH VERIFICATION PASSED");
      }
      console.log("=".repeat(80) + "\n");
    }

    console.log(
      `⚠️ Verification using reconstructed payload for breach ${breachRecord.id} (no canonical stored)`
    );
    if (!isValid) {
      console.error(`❌ MISMATCH for breach ${breachRecord.id} (old record):`, {
        stored,
        computed,
        canonicalPreview: canonical.substring(0, 200),
      });
    }

    return {
      isValid,
      status: isValid ? "VERIFIED" : "TAMPERED",
      breachId: breachRecord.id,
      storedHash: stored,
      computedHash: computed,
      hashMatch: isValid,
      method: "reconstructed_fallback",
    };
  } catch (error) {
    console.error(
      `❌ Integrity verification failed for breach ${breachRecord.id}:`,
      error
    );
    return {
      isValid: false,
      status: "VERIFICATION_FAILED",
      breachId: breachRecord.id,
      error: error.message,
    };
  }
}

/**
 * Verify multiple breach records in batch
 * @param {Array} breachRecords - Array of breach records
 * @returns {Array} Array of verification results
 */
export async function verifyBreachesIntegrity(breachRecords) {
  if (!Array.isArray(breachRecords)) {
    return [];
  }

  const results = [];
  for (const record of breachRecords) {
    const verification = await verifyBreachIntegrity(record);
    results.push(verification);
  }

  return results;
}

/**
 * Log integrity verification result
 * Useful for debugging and monitoring
 */
export function logIntegrityResult(verification) {
  if (!verification) return;

  switch (verification.status) {
    case "VERIFIED":
      console.log(`✓ Breach ${verification.breachId} integrity verified`);
      break;
    case "TAMPERED":
      console.warn(
        `⚠️ INTEGRITY ALERT: Breach ${verification.breachId} appears tampered!`,
        {
          stored: verification.storedHash,
          computed: verification.computedHash,
        }
      );
      break;
    case "VERIFICATION_FAILED":
      console.error(
        `❌ Integrity verification failed for ${verification.breachId}:`,
        verification.error
      );
      break;
    case "NO_HASH_STORED":
      console.info(`ℹ️ No hash available for breach ${verification.breachId}`);
      break;
    default:
      console.log(`? Unknown verification status: ${verification.status}`);
  }
}

/**
 * Create integrity summary from multiple verification results
 */
export function createIntegritySummary(verifications) {
  if (!Array.isArray(verifications)) {
    return null;
  }

  const summary = {
    total: verifications.length,
    verified: 0,
    tampered: 0,
    failed: 0,
    noHash: 0,
    breachesWithIssues: [],
  };

  for (const v of verifications) {
    switch (v.status) {
      case "VERIFIED":
        summary.verified++;
        break;
      case "TAMPERED":
        summary.tampered++;
        summary.breachesWithIssues.push({
          id: v.breachId,
          status: "TAMPERED",
          details: v,
        });
        break;
      case "VERIFICATION_FAILED":
        summary.failed++;
        summary.breachesWithIssues.push({
          id: v.breachId,
          status: "VERIFICATION_FAILED",
          error: v.error,
        });
        break;
      case "NO_HASH_STORED":
        summary.noHash++;
        break;
    }
  }

  summary.integrityOk = summary.tampered === 0 && summary.failed === 0;

  return summary;
}
