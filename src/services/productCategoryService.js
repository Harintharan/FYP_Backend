import { randomUUID } from "node:crypto";
import { ProductCategoryPayload } from "../domain/productCategory.schema.js";
import {
  createProductCategory,
  updateProductCategory,
  deleteProductCategory,
  findProductCategoryById,
  findProductCategoryByName,
  listProductCategories,
} from "../models/ProductCategoryModel.js";
import {
  registrationRequired,
  categoryAlreadyExists,
  categoryNotFound,
} from "../errors/productCategoryErrors.js";

const UNIQUE_VIOLATION = "23505";

function ensureManufacturerRegistration(registration) {
  if (!registration?.id) {
    throw registrationRequired();
  }
}

function formatCategory(record) {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
  };
}

export async function createProductCategoryRecord({ payload, registration }) {
  ensureManufacturerRegistration(registration);

  const parsed = ProductCategoryPayload.parse(payload);
  const existing = await findProductCategoryByName(parsed.name);
  if (existing) {
    throw categoryAlreadyExists(parsed.name);
  }

  const id = randomUUID();
  try {
    const record = await createProductCategory({
      id,
      name: parsed.name,
    });

    return {
      statusCode: 201,
      body: formatCategory(record),
    };
  } catch (err) {
    if (err?.code === UNIQUE_VIOLATION) {
      throw categoryAlreadyExists(parsed.name);
    }
    throw err;
  }
}

export async function updateProductCategoryRecord({
  id,
  payload,
  registration,
}) {
  ensureManufacturerRegistration(registration);

  const existing = await findProductCategoryById(id);
  if (!existing) {
    throw categoryNotFound();
  }

  const parsed = ProductCategoryPayload.parse(payload);
  if (
    parsed.name.toLowerCase() !== existing.name.toLowerCase()
  ) {
    const conflict = await findProductCategoryByName(parsed.name);
    if (conflict) {
      throw categoryAlreadyExists(parsed.name);
    }
  }

  try {
    const record = await updateProductCategory(id, { name: parsed.name });
    if (!record) {
      throw categoryNotFound();
    }

    return {
      statusCode: 200,
      body: formatCategory(record),
    };
  } catch (err) {
    if (err?.code === UNIQUE_VIOLATION) {
      throw categoryAlreadyExists(parsed.name);
    }
    throw err;
  }
}

export async function deleteProductCategoryRecord({ id, registration }) {
  ensureManufacturerRegistration(registration);

  const existing = await findProductCategoryById(id);
  if (!existing) {
    throw categoryNotFound();
  }

  await deleteProductCategory(id);

  return {
    statusCode: 204,
    body: null,
  };
}

export async function listAllProductCategories() {
  const rows = await listProductCategories();
  return {
    statusCode: 200,
    body: rows.map((row) => formatCategory(row)),
  };
}

export async function getProductCategoryRecord({ id }) {
  const record = await findProductCategoryById(id);
  if (!record) {
    throw categoryNotFound();
  }

  return {
    statusCode: 200,
    body: formatCategory(record),
  };
}
