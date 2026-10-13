import { describe, expect, test } from "bun:test";
import {
  analyzeModels,
  applyFeedValues,
  FIELDS,
  type RawModel,
} from "../src/refresh.ts";
import type { FeedIndex, FeedModel } from "../src/feeds/types.ts";

function index(name: string, entries: Array<[string, FeedModel]>): FeedIndex {
  return { name, url: `https://example.test/${name}`, byId: new Map(entries) };
}

const model: RawModel = {
  model: "Claude Opus 5.5",
  lab: "Anthropic",
  inputPerMtok: 4,
  outputPerMtok: 20,
  cachedInputPerMtok: 0.2,
  contextTokens: 1_000_000,
  sourceId: "models.dev:anthropic/claude-opus-5-5",
};

const feedModel: FeedModel = {
  key: "anthropic/claude-opus-5-5",
  inputPerMtok: 4,
  outputPerMtok: 20,
  cachedInputPerMtok: 0.2,
  contextTokens: 1_000_000,
};

const modelsDev = index("models.dev", [["anthropic/claude-opus-5-5", feedModel]]);
const empty = index("other", []);

function crossWith(feedModel: FeedModel, name: "OpenRouter" | "LiteLLM"): FeedIndex {
  return index(name, [["claudeopus55", feedModel]]);
}

describe("analyzeModels", () => {
  test("reports no drift when data matches the feed everywhere", () => {
    const or = crossWith(feedModel, "OpenRouter");
    const report = analyzeModels([model], modelsDev, or, empty);
    expect(report.changes).toEqual([]);
    expect(report.disagree).toEqual([]);
    expect(report.unmapped).toEqual([]);
    expect(report.feedMiss).toEqual([]);
  });

  test("detects price and context drift", () => {
    const diverged: FeedModel = { ...feedModel, inputPerMtok: 5, contextTokens: 500_000 };
    const report = analyzeModels([model], index("models.dev", [["anthropic/claude-opus-5-5", diverged]]), empty, empty);
    expect(report.changes).toEqual([
      { model: "Claude Opus 5.5", field: "inputPerMtok", from: 4, to: 5 },
      { model: "Claude Opus 5.5", field: "contextTokens", from: 1_000_000, to: 500_000 },
    ]);
  });

  test("ignores context diffs inside the 2% tolerance", () => {
    const near: FeedModel = { ...feedModel, contextTokens: 1_010_000 };
    const report = analyzeModels([model], index("models.dev", [["anthropic/claude-opus-5-5", near]]), empty, empty);
    expect(report.changes).toEqual([]);
    expect(report.disagree).toEqual([]);
  });

  test("flags cross-check disagreements that exceed tolerance", () => {
    const or = crossWith({ ...feedModel, inputPerMtok: 9 }, "OpenRouter");
    const report = analyzeModels([model], modelsDev, or, empty);
    expect(report.disagree).toHaveLength(1);
    expect(report.disagree[0]?.field).toBe("inputPerMtok");
  });

  test("does not flag cross-check values inside tolerance", () => {
    const or = crossWith({ ...feedModel, inputPerMtok: 4.005 }, "OpenRouter");
    const report = analyzeModels([model], modelsDev, or, empty);
    expect(report.disagree).toEqual([]);
  });

  test("lists models without a sourceId as unmapped", () => {
    const report = analyzeModels([{ ...model, sourceId: undefined }], modelsDev, empty, empty);
    expect(report.unmapped).toEqual(["Claude Opus 5.5"]);
  });

  test("lists sourceIds missing from the feed as feedMiss", () => {
    const report = analyzeModels([{ ...model, sourceId: "models.dev:anthropic/vanished" }], modelsDev, empty, empty);
    expect(report.feedMiss).toEqual(["Claude Opus 5.5 (models.dev:anthropic/vanished)"]);
  });

  test("reports new feed models under known labs that are not referenced", () => {
    const md = index("models.dev", [
      ["anthropic/claude-opus-5-5", feedModel],
      ["anthropic/claude-omni-6", { key: "claude-omni-6", inputPerMtok: 1, outputPerMtok: 5, cachedInputPerMtok: null, contextTokens: 100000 }],
    ]);
    const report = analyzeModels([model], md, empty, empty);
    expect(report.newFeedModels.anthropic).toEqual(["claude-omni-6"]);
  });
});

describe("applyFeedValues", () => {
  test("writes feed values onto sourced fields and leaves prose untouched", () => {
    const diverged: FeedModel = { ...feedModel, inputPerMtok: 5, outputPerMtok: 24 };
    const md = index("models.dev", [["anthropic/claude-opus-5-5", diverged]]);
    const [out] = applyFeedValues([model], md);
    expect(out?.inputPerMtok).toBe(5);
    expect(out?.outputPerMtok).toBe(24);
    expect(out?.cachedInputPerMtok).toBe(0.2);
    expect(out?.contextTokens).toBe(1_000_000);
    const keys = out ? Object.keys(out) : [];
    for (const f of FIELDS) expect(keys).toContain(f);
  });

  test("leaves unmapped models unchanged", () => {
    const [out] = applyFeedValues([{ ...model, sourceId: undefined }], modelsDev);
    expect(out?.inputPerMtok).toBe(4);
  });
});