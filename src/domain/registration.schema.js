import { z } from "zod";

const identificationSchema = z.object({
  uuid: z.string().uuid(),
  legalName: z.string().min(1),
  businessRegNo: z.string().min(1),
  countryOfIncorporation: z.string().min(2).max(3).optional(),
});

const contactSchema = z.object({
  personName: z.string().min(1),
  designation: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5),
  address: z.string().min(1),
});

const metadataSchema = z.object({
  publicKey: z.string().regex(/^0x[0-9a-fA-F]+$/, "publicKey must be hex"),
  smartContractRole: z.enum(["MANUFACTURER", "SUPPLIER", "WAREHOUSE"]),
  dateOfRegistration: z.string(),
});

const manufacturerDetailsSchema = z.object({
  productCategoriesManufactured: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
});

const supplierDetailsSchema = z.object({
  typeOfSupplies: z.string().min(1),
  productCategoriesSupplied: z.array(z.string()).default([]),
  sourceRegions: z.array(z.string()).default([]),
  supplyCapacity: z.string().min(1),
  averageDeliveryTime: z.string().min(1),
});

const warehouseDetailsSchema = z.object({
  officeAddress: z.string().min(1),
  countryOfIncorporation: z.string().min(2).max(3),
});

const baseSchema = z.object({
  identification: identificationSchema,
  contact: contactSchema,
  metadata: metadataSchema,
});

export const RegistrationPayload = z.discriminatedUnion("type", [
  baseSchema.extend({
    type: z.literal("MANUFACTURER"),
    details: manufacturerDetailsSchema,
  }),
  baseSchema.extend({
    type: z.literal("SUPPLIER"),
    details: supplierDetailsSchema,
  }),
  baseSchema.extend({
    type: z.literal("WAREHOUSE"),
    details: warehouseDetailsSchema,
  }),
]);
