import { z } from "zod";

const requiredString = (label) =>
  z
    .string({ required_error: `${label} is required` })
    .min(1, `${label} is required`);

const identificationSchema = z.object({
  uuid: z
    .string({ required_error: "identification.uuid is required" })
    .uuid("identification.uuid must be a valid UUID"),
  legalName: requiredString("identification.legalName"),
  businessRegNo: requiredString("identification.businessRegNo"),
  countryOfIncorporation: requiredString(
    "identification.countryOfIncorporation"
  )
    .min(2, "identification.countryOfIncorporation must be at least 2 characters")
    .max(3, "identification.countryOfIncorporation must be at most 3 characters"),
  publicKey: z
    .string({ required_error: "identification.publicKey is required" })
    .regex(
      /^0x[0-9a-fA-F]+$/,
      "identification.publicKey must be a hex string"
    ),
});

const contactSchema = z.object({
  personName: requiredString("contact.personName"),
  designation: requiredString("contact.designation"),
  email: z
    .string({ required_error: "contact.email is required" })
    .email("contact.email must be a valid email"),
  phone: requiredString("contact.phone"),
  address: requiredString("contact.address"),
});

const metadataSchema = z.object({
  publicKey: z
    .string({ required_error: "metadata.publicKey is required" })
    .regex(/^0x[0-9a-fA-F]+$/, "metadata.publicKey must be a hex string"),
  smartContractRole: z.enum(["MANUFACTURER", "SUPPLIER", "WAREHOUSE"], {
    required_error: "metadata.smartContractRole is required",
  }),
  dateOfRegistration: requiredString("metadata.dateOfRegistration"),
});

const manufacturerDetailsSchema = z.object({
  productCategoriesManufactured: z
    .array(requiredString("details.productCategoriesManufactured item"))
    .min(1, "details.productCategoriesManufactured must contain at least one item"),
  certifications: z
    .array(requiredString("details.certifications item"))
    .min(1, "details.certifications must contain at least one item"),
});

const supplierDetailsSchema = z.object({
  productCategoriesSupplied: z
    .array(requiredString("details.productCategoriesSupplied item"))
    .min(1, "details.productCategoriesSupplied must contain at least one item"),
  sourceRegions: z
    .array(requiredString("details.sourceRegions item"))
    .min(1, "details.sourceRegions must contain at least one item"),
});

const warehouseDetailsSchema = z.object({
  officeAddress: requiredString("details.officeAddress"),
  countryOfIncorporation: requiredString("details.countryOfIncorporation")
    .min(2, "details.countryOfIncorporation must be at least 2 characters")
    .max(3, "details.countryOfIncorporation must be at most 3 characters"),
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
