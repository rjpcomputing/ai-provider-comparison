export interface FeedModel {
  key: string;
  inputPerMtok: number | null;
  outputPerMtok: number | null;
  cachedInputPerMtok: number | null;
  contextTokens: number | null;
}

export interface FeedIndex {
  name: string;
  url: string;
  byId: Map<string, FeedModel>;
}

export function normalizeKey(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function perTokenToPerMtok(value: number | string | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n * 1e6 : null;
}