import type { FeedIndex, FeedModel } from "./types.ts";

interface ModelsDevModel {
  cost?: { input?: number; output?: number; cache_read?: number };
  limit?: { context?: number };
}

interface ModelsDevEntry {
  id: string;
  models?: Record<string, ModelsDevModel>;
}

type ModelsDevResponse = Record<string, ModelsDevEntry>;

export const MODELS_DEV_URL = "https://models.dev/api.json";

function toFeedModel(key: string, m: ModelsDevModel): FeedModel {
  return {
    key,
    inputPerMtok: m.cost?.input ?? null,
    outputPerMtok: m.cost?.output ?? null,
    cachedInputPerMtok: m.cost?.cache_read ?? null,
    contextTokens: m.limit?.context ?? null,
  };
}

export async function fetchModelsDev(url: string = MODELS_DEV_URL): Promise<FeedIndex> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`models.dev fetch failed: HTTP ${res.status}`);
  const json = (await res.json()) as ModelsDevResponse;
  const byId = new Map<string, FeedModel>();
  for (const [provider, entry] of Object.entries(json)) {
    for (const [key, model] of Object.entries(entry.models ?? {})) {
      byId.set(`${provider}/${key}`, toFeedModel(`${provider}/${key}`, model));
    }
  }
  return { name: "models.dev", url, byId };
}