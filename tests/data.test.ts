import { describe, expect, test } from "bun:test";
import { loadData } from "../src/load.ts";
import { modelSchema, providersFileSchema, metaSchema } from "../src/schema.ts";

describe("site data", () => {
  const data = loadData();

  test("loads and validates against the schema", () => {
    expect(data.providers.length).toBeGreaterThan(0);
    expect(data.models.length).toBeGreaterThan(0);
    expect(metaSchema.safeParse(data.meta).success).toBe(true);
    expect(providersFileSchema.safeParse(data.providers).success).toBe(true);
  });

  test("provider ids are unique", () => {
    const ids = data.providers.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every provider has at least one plan and one model", () => {
    for (const p of data.providers) {
      expect(p.plans.length).toBeGreaterThan(0);
      expect(p.primaryModels.length).toBeGreaterThan(0);
    }
  });

  test("every model is valid and non-negative priced", () => {
    for (const m of data.models) {
      expect(modelSchema.safeParse(m).success).toBe(true);
      expect(m.inputPerMtok).toBeGreaterThanOrEqual(0);
      expect(m.outputPerMtok).toBeGreaterThanOrEqual(0);
    }
  });

  test("lastUpdated matches timestamp format", () => {
    expect(data.meta.lastUpdated).toMatch(/^\d{4}-\d{2}(-\d{2})([T ]\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/);
  });
});
