import { z } from "zod";

/**
 * Schema for the site data. This is the single source of truth for the shape
 * of everything in /data. `z.infer` derives the TypeScript types so the code
 * and the monthly-updated JSON can never drift apart.
 */

export const usageKindSchema = z.enum([
  "ai_credits",
  "requests",
  "sessions",
  "tokens",
  "unmetered",
  "byok",
]);

export const planSchema = z.object({
  name: z.string().min(1),
  priceMonthly: z.number().nonnegative(),
  priceAnnual: z.number().nonnegative().nullable().default(null),
  currency: z.literal("USD"),
  includedUsage: z.object({
    kind: usageKindSchema,
    units: z.number().nonnegative().nullable().default(null),
    note: z.string().default(""),
  }),
  limits: z.string().default(""),
  notes: z.string().optional(),
});

export const providerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id must be kebab-case"),
  name: z.string().min(1),
  vendor: z.string().min(1),
  url: z.string().min(1),
  summary: z.string().min(1),
  pros: z.array(z.string().min(1)).default([]),
  cons: z.array(z.string().min(1)).default([]),
  primaryModels: z.array(z.string().min(1)).default([]),
  plans: z.array(planSchema).min(1),
});

export const reasoningLevelSchema = z.enum([
  "lightweight",
  "versatile",
  "powerful",
  "specialized",
  "extended",
]);

export const countryOfOriginSchema = z.enum(["US", "China", "Other"]).default("US");

export const modelSchema = z.object({
  model: z.string().min(1),
  lab: z.string().min(1),
  inputPerMtok: z.number().nonnegative(),
  outputPerMtok: z.number().nonnegative(),
  cachedInputPerMtok: z.number().nonnegative().nullable().default(null),
  contextTokens: z.number().int().positive(),
  availableVia: z.array(z.string().min(1)).default([]),
  reasoningLevel: reasoningLevelSchema,
  countryOfOrigin: countryOfOriginSchema.default("US"),
  notes: z.string().optional(),
  sourceId: z.string().optional(),
});

export const metaSchema = z.object({
  title: z.string().min(1),
  currency: z.literal("USD"),
  lastUpdated: z.string().regex(
    /^\d{4}-\d{2}(-\d{2})([T ]\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/,
    "expected YYYY-MM, YYYY-MM-DD, or ISO 8601 timestamp"
  ),
  schemaVersion: z.number().int().positive(),
  sources: z.array(z.string().min(1)).default([]),
});

export const providersFileSchema = z.array(providerSchema);
export const modelsFileSchema = z.array(modelSchema);

export type UsageKind = z.infer<typeof usageKindSchema>;
export type Usage = z.infer<typeof planSchema>["includedUsage"];
export type Plan = z.infer<typeof planSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type ReasoningLevel = z.infer<typeof reasoningLevelSchema>;
export type CountryOfOrigin = z.infer<typeof countryOfOriginSchema>;
export type Model = z.infer<typeof modelSchema>;
export type Meta = z.infer<typeof metaSchema>;
