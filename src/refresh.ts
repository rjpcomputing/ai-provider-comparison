import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { metaSchema, modelsFileSchema } from "./schema.ts";
import { fetchLiteLlm } from "./feeds/litellm.ts";
import { fetchModelsDev } from "./feeds/modelsdev.ts";
import { fetchOpenRouter } from "./feeds/openrouter.ts";
import { normalizeKey, type FeedIndex, type FeedModel } from "./feeds/types.ts";

const ROOT = join(import.meta.dir, "..");
const DATA = join(ROOT, "data");

export const SOURCE_PREFIX = "models.dev:";
const PRICE_TOL = { rel: 0.01, abs: 0.01 };
const CONTEXT_TOL = { rel: 0.02, abs: 0 };

export const FEED_URLS = [
  "https://models.dev/api.json",
  "https://openrouter.ai/api/v1/models",
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
];

export type Field = "inputPerMtok" | "outputPerMtok" | "cachedInputPerMtok" | "contextTokens";

export const FIELDS: readonly Field[] = [
  "inputPerMtok",
  "outputPerMtok",
  "cachedInputPerMtok",
  "contextTokens",
];

export interface RawModel {
  model: string;
  inputPerMtok: number | null;
  outputPerMtok: number | null;
  cachedInputPerMtok: number | null;
  contextTokens: number | null;
  sourceId?: string;
  [key: string]: unknown;
}

export interface Change {
  model: string;
  field: Field;
  from: number | null;
  to: number | null;
}

export interface CrossCheckRow {
  model: string;
  field: Field;
  primary: number | null;
  values: Record<string, number | null>;
}

export interface Report {
  changes: Change[];
  disagree: CrossCheckRow[];
  unmapped: string[];
  feedMiss: string[];
  newFeedModels: Record<string, string[]>;
}

function withinTolerance(p: number, c: number, rel: number, abs: number): boolean {
  if (p === c) return true;
  const diff = Math.abs(p - c);
  const scale = Math.max(Math.abs(p), Math.abs(c));
  return diff <= abs || diff <= scale * rel;
}

function exceedsTolerance(from: number | null, to: number | null, field: Field): boolean {
  if (from === to) return false;
  if (from === null || to === null) return true;
  const { rel, abs } = toleranceFor(field);
  return !withinTolerance(from, to, rel, abs);
}

function toleranceFor(field: Field): { rel: number; abs: number } {
  return field === "contextTokens" ? CONTEXT_TOL : PRICE_TOL;
}

const LAB_PROVIDERS = ["anthropic", "openai", "google", "xai", "zai", "moonshotai", "minimax"];
const UNSEEN_BLOCK =
  /image|tts|live|preview|embedding|veo|lyria|computer-use|deep-research|latest|gemma|-highspeed/i;

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA, file), "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(join(DATA, file), `${JSON.stringify(value, null, 2)}\n`);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function sourceIdOf(model: RawModel): string | undefined {
  return model.sourceId?.startsWith(SOURCE_PREFIX)
    ? model.sourceId.slice(SOURCE_PREFIX.length)
    : undefined;
}

function crossLookup(index: FeedIndex | undefined, name: string): FeedModel | undefined {
  return index?.byId.get(normalizeKey(name));
}

/** Compare data/ models against the feeds and classify every drift. Pure and offline-testable. */
export function analyzeModels(
  rawModels: RawModel[],
  modelsDev: FeedIndex,
  openRouter: FeedIndex,
  liteLlm: FeedIndex,
): Report {
  const changes: Change[] = [];
  const crossRows: CrossCheckRow[] = [];
  const unmapped: string[] = [];
  const feedMiss: string[] = [];
  const referencedIds = new Set<string>();

  for (const model of rawModels) {
    const id = sourceIdOf(model);
    const feed = id ? modelsDev.byId.get(id) : undefined;

    if (id) referencedIds.add(id);
    if (!id) {
      unmapped.push(model.model);
      continue;
    }
    if (!feed) {
      feedMiss.push(`${model.model} (${model.sourceId})`);
      continue;
    }

    const or = crossLookup(openRouter, model.model);
    const ll = crossLookup(liteLlm, model.model);

    for (const field of FIELDS) {
      const from = model[field];
      const to = feed[field];
      if (exceedsTolerance(from, to, field))
        changes.push({ model: model.model, field, from, to });

      const cross: Record<string, number | null> = {};
      if (or) cross[openRouter.name] = or[field];
      if (ll) cross[liteLlm.name] = ll[field];

      const checked = Object.values(cross).some((v) => v !== null && v !== undefined);
      if (checked) crossRows.push({ model: model.model, field, primary: to ?? from, values: cross });
    }
  }

  const disagree: CrossCheckRow[] = [];
  for (const row of crossRows) {
    const { rel, abs } = toleranceFor(row.field);
    for (const cr of Object.values(row.values)) {
      if (cr === null || cr === undefined) continue;
      if (row.primary === null || row.primary === undefined) continue;
      if (!withinTolerance(row.primary, cr, rel, abs)) {
        disagree.push(row);
        break;
      }
    }
  }

  return {
    changes,
    disagree,
    unmapped,
    feedMiss,
    newFeedModels: unseenModels(modelsDev, rawModels, referencedIds),
  };
}

/** Overwrite the feed-backed fields of every sourced model. Returns the updated list. */
export function applyFeedValues(rawModels: RawModel[], modelsDev: FeedIndex): RawModel[] {
  return rawModels.map((model) => {
    const updated = { ...model };
    const feed = sourceIdOf(model) ? modelsDev.byId.get(sourceIdOf(model) ?? "") : undefined;
    if (!feed) return updated;
    for (const field of FIELDS) updated[field] = feed[field];
    return updated;
  });
}

function unseenModels(
  modelsDev: FeedIndex,
  dataModels: RawModel[],
  referenced: Set<string>,
): Record<string, string[]> {
  const dataKeys = new Set<string>();
  for (const m of dataModels) dataKeys.add(normalizeKey(m.model));

  const result: Record<string, string[]> = {};
  for (const prov of LAB_PROVIDERS) {
    const keys: string[] = [];
    for (const [rawId] of modelsDev.byId) {
      if (!rawId.startsWith(`${prov}/`)) continue;
      const key = rawId.slice(prov.length + 1);
      if (referenced.has(rawId) || dataKeys.has(normalizeKey(key))) continue;
      if (UNSEEN_BLOCK.test(key)) continue;
      keys.push(key);
    }
    if (keys.length > 0) result[prov] = keys.sort();
  }
  return result;
}

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "null";
  return v % 1 === 0 ? String(v) : String(Math.round(v * 1000) / 1000);
}

function printReport(r: Report): void {
  const rule = "-".repeat(72);
  if (r.changes.length > 0) {
    console.log(rule);
    console.log(`CHANGES (${r.changes.length}) — dry run; pass --write to apply:`);
    console.log(rule);
    for (const c of r.changes) {
      console.log(
        `  ${c.model.padEnd(30)} ${c.field.padEnd(20)} ${fmt(c.from).padStart(10)} -> ${fmt(c.to).padStart(10)}`,
      );
    }
  } else {
    console.log("No price drift vs models.dev.");
  }

  if (r.disagree.length > 0) {
    console.log(rule);
    console.log(`CROSS-CHECK DISAGREEMENTS (${r.disagree.length}) — blocks --write unless --force:`);
    console.log(rule);
    for (const row of r.disagree) {
      const vals = Object.entries(row.values)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([f, v]) => `${f}=${fmt(v)}`)
        .join(", ");
      console.log(
        `  ${row.model.padEnd(30)} ${row.field.padEnd(20)} primary=${fmt(row.primary)} (${vals})`,
      );
    }
  }

  if (r.feedMiss.length > 0) {
    console.log(rule);
    console.log(
      `SOURCE IDS MISSING FROM FEED (${r.feedMiss.length}) — feed removed these; --check treats as drift:`,
    );
    console.log(rule);
    for (const m of r.feedMiss) console.log(`  ${m}`);
    console.log("  (drop or fix the sourceId, or add an explicit mapping.)");
  }

  if (r.unmapped.length > 0) {
    console.log(rule);
    console.log(`UNMAPPED — no sourceId; add one to enable auto-refresh (${r.unmapped.length}):`);
    console.log(rule);
    for (const m of r.unmapped) console.log(`  ${m}`);
  }

  const unseenTotal = Object.values(r.newFeedModels).reduce((n, ks) => n + ks.length, 0);
  if (unseenTotal > 0) {
    console.log(rule);
    console.log(`NEW FEED MODELS — in models.dev under your labs, not in data/ (${unseenTotal}):`);
    console.log(rule);
    for (const [prov, keys] of Object.entries(r.newFeedModels)) {
      for (const k of keys) console.log(`  ${prov}/${k}`);
    }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const wantWrite = argv.includes("--write");
  const force = argv.includes("--force");
  const check = argv.includes("--check");

  if (force && !wantWrite) throw new Error("--force requires --write");

  const rawModels = readJson<RawModel[]>("models.json");
  const rawMeta = readJson<Record<string, unknown>>("meta.json");

  const [modelsDev, openRouter, liteLlm] = await Promise.all([
    fetchModelsDev(),
    fetchOpenRouter(),
    fetchLiteLlm(),
  ]);

  const report = analyzeModels(rawModels, modelsDev, openRouter, liteLlm);
  printReport(report);

  const hasChanges = report.changes.length > 0;
  const hasDrift = hasChanges || report.feedMiss.length > 0;

  if (wantWrite) {
    if (report.disagree.length > 0 && !force) {
      console.error(
        `\n${report.disagree.length} cross-check disagreement(s) — refusing to write without --force.`,
      );
      process.exit(1);
    }
    if (!hasChanges) {
      console.log("\nNo changes to write.");
      process.exit(0);
    }
    const nextModels = applyFeedValues(rawModels, modelsDev);
    const nextMeta: Record<string, unknown> = { ...rawMeta, lastUpdated: today() };
    const sources = new Set<string>((rawMeta.sources as string[] | undefined) ?? []);
    for (const url of FEED_URLS) sources.add(url);
    nextMeta.sources = [...sources];

    modelsFileSchema.parse(nextModels);
    metaSchema.parse(nextMeta);
    writeJson("models.json", nextModels);
    writeJson("meta.json", nextMeta);

    console.log(`\nWrote ${report.changes.length} change(s); meta.lastUpdated -> ${today()}.`);
    process.exit(0);
  }

  if (check) {
    if (hasDrift) {
      console.error("\n--check: drift detected.");
      process.exit(1);
    }
    console.log("\n--check: up to date.");
    process.exit(0);
  }
}

await main();