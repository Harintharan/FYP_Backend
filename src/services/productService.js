import { randomUUID } from "node:crypto";
import { ProductPayload, ProductUpdatePayload } from "../domain/product.schema.js";
import {
  prepareProductPersistence,
  ensureProductOnChainIntegrity,
  deriveProductPayloadFromRecord,
} from "./productIntegrityService.js";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  findProductById,
  listProducts,
} from "../models/ProductModel.js";
import { findProductCategoryById } from "../models/ProductCategoryModel.js";
import {
  registrationRequired,
  productCategoryNotFound,
  productForbidden,
  productNotFound,
  hashMismatch,
} from "../errors/productErrors.js";
import {
  registerProductOnChain as registerProductRegistryOnChain,
  updateProductOnChain as updateProductRegistryOnChain,
} from "../eth/productContract.js";
import { normalizeHash } from "../utils/hash.js";
import { backupRecordSafely } from "./pinataBackupService.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";

function ensureRegistration(registration) {
  if (!registration?.id) {
    throw registrationRequired();
  }
}

function ensureOwnership(registration, record) {
  if (!registration?.id) {
    throw registrationRequired();
  }

  const manufacturer = record.manufacturer_uuid ?? "";
  if (
    typeof manufacturer !== "string" ||
    manufacturer.trim().toLowerCase() !== registration.id.toLowerCase()
  ) {
    throw productForbidden();
  }
}

function sanitizeOptional(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    value = String(value);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function formatProductRecord(record) {
  return {
    id: record.id,
    productName: record.name,
    productCategory: {
      id: record.product_category_id,
      name: record.category_name ?? null,
    },
    manufacturer: {
      id: record.manufacturer_uuid ?? null,
    },
    requiredStartTemp: sanitizeOptional(record.required_start_temp),
    requiredEndTemp: sanitizeOptional(record.required_end_temp),
    handlingInstructions: sanitizeOptional(record.handling_instructions),
    productHash: normalizeHash(record.product_hash ?? null),
    txHash: record.tx_hash ?? null,
    createdBy: record.created_by ?? null,
    updatedBy: record.updated_by ?? null,
    pinataCid: record.pinata_cid ?? null,
    pinataPinnedAt: record.pinata_pinned_at ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
  };
}

export async function createProductRecord({ payload, registration, wallet }) {
  ensureRegistration(registration);

  const parsed = ProductPayload.parse(payload);
  const category = await findProductCategoryById(parsed.productCategoryId);
  if (!category) {
    throw productCategoryNotFound();
  }

  const manufacturerUuid = registration.id.trim().toLowerCase();
  const productId = randomUUID();
  const { normalized, canonical, payloadHash } = prepareProductPersistence(
    productId,
    { ...parsed, manufacturerUuid }
  );

  const { txHash, productHash } = await registerProductRegistryOnChain(
    uuidToBytes16Hex(productId),
    canonical
  );

  const normalizedOnChain = normalizeHash(productHash);
  const normalizedComputed = normalizeHash(payloadHash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain hash mismatch detected during product registration",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "product",
    record: {
      id: productId,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress: wallet?.walletAddress ?? null,
    operation: "create",
    identifier: productId,
    errorMessage: "⚠️ Failed to back up product to Pinata:",
  });

  await createProduct({
    id: productId,
    name: normalized.productName,
    productCategoryId: normalized.productCategoryId,
    manufacturerUuid: normalized.manufacturerUuid,
    requiredStartTemp: sanitizeOptional(normalized.requiredStartTemp),
    requiredEndTemp: sanitizeOptional(normalized.requiredEndTemp),
    handlingInstructions: sanitizeOptional(normalized.handlingInstructions),
    productHash: payloadHash,
    txHash,
    createdBy: manufacturerUuid,
    pinataCid: pinataBackup?.IpfsHash ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : null,
  });

  const record = await findProductById(productId);
  return {
    statusCode: 201,
    body: {
      ...formatProductRecord(record),
    },
  };
}

export async function updateProductRecord({
  id,
  payload,
  registration,
  wallet,
}) {
  ensureRegistration(registration);

  const existing = await findProductById(id);
  if (!existing) {
    throw productNotFound();
  }

  ensureOwnership(registration, existing);

  const parsed = ProductUpdatePayload.parse(payload);
  const category = await findProductCategoryById(parsed.productCategoryId);
  if (!category) {
    throw productCategoryNotFound();
  }

  const defaults = deriveProductPayloadFromRecord(existing);
  const { normalized, canonical, payloadHash } = prepareProductPersistence(
    id,
    { ...parsed, manufacturerUuid: existing.manufacturer_uuid },
    defaults
  );

  const { txHash, productHash } = await updateProductRegistryOnChain(
    uuidToBytes16Hex(id),
    canonical
  );

  const onChainHash = productHash
    ? normalizeHash(productHash)
    : normalizeHash(payloadHash);
  const normalizedComputed = normalizeHash(payloadHash);

  if (onChainHash !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain hash mismatch detected during product update",
      onChain: onChainHash,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "product",
    record: {
      id,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress: wallet?.walletAddress ?? null,
    operation: "update",
    identifier: id,
    errorMessage: "⚠️ Failed to back up product update to Pinata:",
  });

  await updateProduct(
    id,
    {
      name: normalized.productName,
      productCategoryId: normalized.productCategoryId,
      manufacturerUuid: normalized.manufacturerUuid,
      requiredStartTemp: sanitizeOptional(normalized.requiredStartTemp),
      requiredEndTemp: sanitizeOptional(normalized.requiredEndTemp),
      handlingInstructions: sanitizeOptional(normalized.handlingInstructions),
      productHash: payloadHash,
      txHash,
      updatedBy: registration.id,
      pinataCid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
      pinataPinnedAt: pinataBackup?.Timestamp
        ? new Date(pinataBackup.Timestamp)
        : existing.pinata_pinned_at ?? null,
    }
  );

  const record = await findProductById(id);
  return {
    statusCode: 200,
    body: {
      ...formatProductRecord(record),
    },
  };
}

export async function deleteProductRecord({ id, registration }) {
  ensureRegistration(registration);

  const existing = await findProductById(id);
  if (!existing) {
    throw productNotFound();
  }

  ensureOwnership(registration, existing);

  const deleted = await deleteProduct(id);
  if (!deleted) {
    throw productNotFound();
  }

  return {
    statusCode: 204,
    body: null,
  };
}

export async function getProductDetails({ id, registration }) {
  ensureRegistration(registration);

  const record = await findProductById(id);
  if (!record) {
    throw productNotFound();
  }

  ensureOwnership(registration, record);
  await ensureProductOnChainIntegrity(record);

  return {
    statusCode: 200,
    body: {
      ...formatProductRecord(record),
    },
  };
}

export async function listProductsByOwner({ registration, categoryId }) {
  ensureRegistration(registration);

  const manufacturerUuid = registration.id.trim().toLowerCase();
  const rows = await listProducts({
    manufacturerUuid,
    categoryId: categoryId ?? undefined,
  });

  await Promise.all(rows.map((row) => ensureProductOnChainIntegrity(row)));

  return {
    statusCode: 200,
    body: rows.map((row) => formatProductRecord(row)),
  };
}
