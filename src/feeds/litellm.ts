import { normalizeKey, perTokenToPerMtok, type FeedIndex, type FeedModel } from "./types.ts";

interface LiteLlmModel {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  max_input_tokens?: number;
}

export const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

export async function fetchLiteLlm(url: string = LITELLM_URL): Promise<FeedIndex> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`LiteLLM fetch failed: HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, LiteLlmModel>;
  const byId = new Map<string, FeedModel>();
  for (const [key, m] of Object.entries(json)) {
    if (key === "sample_spec") continue;
    const id = key.split(".").pop() ?? key;
    const norm = normalizeKey(id);
    const isBare = !key.includes(".") && !id.includes("/");
    if (byId.has(norm) && !isBare) continue;
    byId.set(norm, {
      key,
      inputPerMtok: perTokenToPerMtok(m.input_cost_per_token),
      outputPerMtok: perTokenToPerMtok(m.output_cost_per_token),
      cachedInputPerMtok: perTokenToPerMtok(m.cache_read_input_token_cost),
      contextTokens: m.max_input_tokens ?? null,
    });
  }
  return { name: "LiteLLM", url, byId };
}