import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  metaSchema,
  modelsFileSchema,
  providersFileSchema,
  type Meta,
  type Model,
  type Provider,
} from "./schema.ts";

export interface SiteData {
  meta: Meta;
  providers: Provider[];
  models: Model[];
}

const DATA_DIR = join(import.meta.dir, "..", "data");

function readJson(file: string): unknown {
  const path = join(DATA_DIR, file);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Could not read/parse ${path}: ${err instanceof Error ? err.message : err}`);
  }
}

/** Load and validate all site data from /data. Throws on any invalid input. */
export function loadData(): SiteData {
  const meta = metaSchema.parse(readJson("meta.json"));
  const providers = providersFileSchema.parse(readJson("providers.json"));
  const models = modelsFileSchema.parse(readJson("models.json"));

  const ids = providers.map((p) => p.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate provider id(s): ${[...new Set(duplicates)].join(", ")}`);
  }

  return { meta, providers, models };
}
