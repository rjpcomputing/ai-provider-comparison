export interface CostInputs {
  inputTokensPerMonth: number;
  outputTokensPerMonth: number;
  cachedShare: number;
}

/** The subset of a model that cost estimation depends on. */
export interface CostModel {
  inputPerMtok: number;
  outputPerMtok: number;
  cachedInputPerMtok: number | null;
}

export const DEFAULT_COST_INPUTS: CostInputs = {
  inputTokensPerMonth: 47_500_000,
  outputTokensPerMonth: 2_500_000,
  cachedShare: 0.8,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function nonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Estimated monthly USD cost of serving the given token mix on a model. */
export function estimateMonthlyCost(model: CostModel, inputs: CostInputs): number {
  const inputTokens = nonNegative(inputs.inputTokensPerMonth);
  const outputTokens = nonNegative(inputs.outputTokensPerMonth);
  const cachedTokens = inputTokens * clamp01(inputs.cachedShare);
  const billedInputTokens = inputTokens - cachedTokens;
  const cachedRate = model.cachedInputPerMtok ?? model.inputPerMtok;
  return (
    (billedInputTokens / 1e6) * model.inputPerMtok +
    (cachedTokens / 1e6) * cachedRate +
    (outputTokens / 1e6) * model.outputPerMtok
  );
}

/** Blended USD per 1M tokens across the whole mix (cost / total tokens). */
export function blendedRatePerMtok(model: CostModel, inputs: CostInputs): number {
  const total = nonNegative(inputs.inputTokensPerMonth) + nonNegative(inputs.outputTokensPerMonth);
  if (total === 0) return 0;
  return (estimateMonthlyCost(model, inputs) / total) * 1e6;
}

/** Format a USD amount for display, e.g. `$1,234.50`. */
export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
