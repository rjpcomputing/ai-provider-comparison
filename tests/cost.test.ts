import { describe, expect, test } from "bun:test";
import {
  blendedRatePerMtok,
  estimateMonthlyCost,
  formatUsd,
  type CostInputs,
  type CostModel,
} from "../src/cost.ts";

const model: CostModel = {
  inputPerMtok: 3,
  outputPerMtok: 15,
  cachedInputPerMtok: 0.3,
};

function inputs(over: Partial<CostInputs> = {}): CostInputs {
  return { inputTokensPerMonth: 0, outputTokensPerMonth: 0, cachedShare: 0, ...over };
}

describe("cost model", () => {
  test("zero volume costs nothing", () => {
    expect(estimateMonthlyCost(model, inputs())).toBe(0);
    expect(blendedRatePerMtok(model, inputs())).toBe(0);
  });

  test("pure input bills at the input rate", () => {
    expect(estimateMonthlyCost(model, inputs({ inputTokensPerMonth: 2_000_000 }))).toBe(6);
  });

  test("pure output bills at the output rate", () => {
    expect(estimateMonthlyCost(model, inputs({ outputTokensPerMonth: 2_000_000 }))).toBe(30);
  });

  test("blends input and output by token mix", () => {
    const cost = estimateMonthlyCost(
      model,
      inputs({ inputTokensPerMonth: 7_000_000, outputTokensPerMonth: 3_000_000 }),
    );
    expect(cost).toBeCloseTo(21 + 45, 10);
    expect(
      blendedRatePerMtok(
        model,
        inputs({ inputTokensPerMonth: 7_000_000, outputTokensPerMonth: 3_000_000 }),
      ),
    ).toBeCloseTo(6.6, 10);
  });

  test("cached input lowers the cost using the cached rate", () => {
    const cost = estimateMonthlyCost(
      model,
      inputs({ inputTokensPerMonth: 1_000_000, cachedShare: 0.5 }),
    );
    expect(cost).toBeCloseTo(0.5 * 3 + 0.5 * 0.3, 10);
  });

  test("missing cached rate falls back to the input rate", () => {
    const noCache: CostModel = { ...model, cachedInputPerMtok: null };
    const cost = estimateMonthlyCost(
      noCache,
      inputs({ inputTokensPerMonth: 1_000_000, cachedShare: 1 }),
    );
    expect(cost).toBeCloseTo(3, 10);
  });

  test("cachedShare is clamped to 0..1", () => {
    const wild = estimateMonthlyCost(
      model,
      inputs({ inputTokensPerMonth: 1_000_000, cachedShare: 5 }),
    );
    const full = estimateMonthlyCost(
      model,
      inputs({ inputTokensPerMonth: 1_000_000, cachedShare: 1 }),
    );
    expect(wild).toBeCloseTo(full, 10);
  });

  test("negative and non-finite volumes are treated as zero", () => {
    expect(estimateMonthlyCost(model, inputs({ inputTokensPerMonth: -100 }))).toBe(0);
    expect(estimateMonthlyCost(model, inputs({ outputTokensPerMonth: Number.NaN }))).toBe(0);
  });

  test("formatUsd renders dollars with two decimals", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });
});
