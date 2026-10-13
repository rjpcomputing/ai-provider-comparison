import { normalizeKey, perTokenToPerMtok, type FeedIndex, type FeedModel } from "./types.ts";

interface OpenRouterModel {
  id: string;
  pricing?: {
    prompt?: number | string;
    completion?: number | string;
    input_cache_read?: number | string;
  };
  context_length?: number;
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/models";

function toFeedModel(m: OpenRouterModel): FeedModel {
  return {
    key: m.id,
    inputPerMtok: perTokenToPerMtok(m.pricing?.prompt),
    outputPerMtok: perTokenToPerMtok(m.pricing?.completion),
    cachedInputPerMtok: perTokenToPerMtok(m.pricing?.input_cache_read),
    contextTokens: m.context_length ?? null,
  };
}

export async function fetchOpenRouter(url: string = OPENROUTER_URL): Promise<FeedIndex> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenRouter fetch failed: HTTP ${res.status}`);
  const json = (await res.json()) as OpenRouterResponse;
  const byId = new Map<string, FeedModel>();
  for (const model of json.data) {
    const key = normalizeKey(model.id.split("/").pop() ?? model.id);
    byId.set(key, toFeedModel(model));
  }
  return { name: "OpenRouter", url, byId };
}