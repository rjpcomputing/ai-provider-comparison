# CONTEXT.md

Project context, design decisions, and how to continue development on
`ai-provider-compare`.

For agent/contributor rules (commands, golden rules, repo layout, the server-shutdown
rule) see [`AGENTS.md`](./AGENTS.md).

## Purpose

Compare AI coding providers — GitHub Copilot, Anthropic Claude, Cursor, OpenAI
(ChatGPT/Codex), Google Gemini, xAI (Grok), and opencode — on:

- pricing (monthly + annual), across every plan tier
- included monthly usage (credits / requests / session windows / tokens)
- pros and cons
- primary models
- per-model token cost (input / output / cached $ per 1M tokens)
- a blended input/output token-mix → estimated $/month cost calculator

The site is regenerated from `data/*.json`, so the monthly maintenance task is: edit the
JSON, bump `meta.lastUpdated`, run `bun run build`.

## Stack decisions (and why)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Runtime / PM / build | **Bun only** | Single fast tool; `Bun.build`, `Bun.serve`, `bun test` built in. |
| Language | **TypeScript, strict** | Types across data, rendering, and client bundle. |
| Data format | **JSON in `data/`** | Trivial to edit monthly, diffable in git, no compile step. |
| Validation | **Zod** (`src/schema.ts`) | `z.infer` makes the schema the single source of truth; bad data fails the build loudly. |
| Rendering | **Typed template strings** (`src/render.ts`) | No framework/templating dependency; static HTML output. |
| Output | **Static `dist/`** | Opens via `file://` or any static host; no backend. |
| Client JS | **`src/client/main.ts` → `dist/app.js`** | Table sort/filter only; bundled by `Bun.build` (browser target). |

Explicitly rejected: npm/yarn/pnpm, a JS framework (React/Next/Astro), and a CMS. The whole
point is a minimal, offline, reviewable, repeatable data → site pipeline.

## Architecture

```
data/*.json  ──load.ts (Zod validate)──▶  SiteData  ──render.ts──▶  dist/index.html
                                              │                         ▲
                                              └──renderDataJson──▶ dist/data.json
src/client/main.ts ──Bun.build──▶ dist/app.js ; public/styles.css ──▶ dist/styles.css
```

- `src/schema.ts` — Zod schemas (`usageKindSchema`, `planSchema`, `providerSchema`,
  `modelSchema`, `metaSchema`) and inferred types (`Provider`, `Plan`, `Model`, `Meta`,
  `Usage`, `SiteData`).
- `src/load.ts` — `loadData(): SiteData`; reads + parses + validates, checks duplicate ids.
- `src/cost.ts` — pure, framework-free cost model (`estimateMonthlyCost`,
  `blendedRatePerMtok`, `formatUsd`, `DEFAULT_COST_INPUTS`); shared by the renderer, the
  client bundle, and the tests.
- `src/render.ts` — HTML builders; `renderSite(data)` and `renderDataJson(data)`.
- `src/build.ts` — orchestrates load → render → write → bundle → copy.
- `src/validate.ts` — load-only, prints counts, exits non-zero on failure.
- `src/serve.ts` — `Bun.serve` static server + `fs.watch` rebuild; path-traversal guarded.

## Data model

### `data/providers.json` — array of `Provider`

```jsonc
{
  "id": "github-copilot",            // kebab-case, unique, rendered as anchor id
  "name": "GitHub Copilot",
  "vendor": "GitHub / Microsoft",
  "url": "https://github.com/features/copilot",
  "summary": "one-liner",
  "pros": ["..."], "cons": ["..."],
  "primaryModels": ["GPT-5.6", "Claude Sonnet"],
  "plans": [{
    "name": "Pro",
    "priceMonthly": 10,              // USD
    "priceAnnual": null,             // total annual charge, or null
    "currency": "USD",
    "includedUsage": {
      "kind": "ai_credits",          // ai_credits | requests | sessions | tokens | unmetered | byok
      "units": 1500,                 // number or null
      "note": "1,000 base + 500 flex; overage $0.01/credit"
    },
    "limits": "1,500 AI credits/mo",
    "notes": "optional"
  }]
}
```

### `data/models.json` — array of `Model`

```jsonc
{
  "model": "Claude Sonnet 4.6",
  "lab": "Anthropic",
  "inputPerMtok": 3,
  "outputPerMtok": 15,
  "cachedInputPerMtok": 0.3,         // number or null
  "contextTokens": 200000,
  "availableVia": ["anthropic-api", "opencode-zen", "github-copilot", "cursor"],
  "reasoningLevel": "versatile",
  "countryOfOrigin": "US",
  "notes": "optional"
}
```

### `data/meta.json`

`title`, `currency` (must be `"USD"`), `lastUpdated` (date or ISO 8601 timestamp like `YYYY-MM-DDTHH:MM:SSZ`),
`schemaVersion`, `sources` (array of URLs, rendered in a collapsible list).

### `includedUsage.kind` — the key modeling decision

Vendors meter subscriptions differently, so the model refuses to fake a universal
"tokens/month":

- `ai_credits` — Copilot / Cursor style credit pools
- `requests` — per-request allowances
- `sessions` — Claude / ChatGPT style 5-hour + weekly windows
- `tokens` — raw token metering
- `unmetered` — included but rate-limited
- `byok` — bring your own key (user pays the API directly)

`units` holds a machine-usable number where the vendor publishes one; `note` carries the
human caveat. The overview table renders these as-is; the methodology section explains why
they aren't directly comparable.

## Monthly update workflow

1. Edit `data/providers.json` (prices, `includedUsage`, `limits`, pros/cons, models).
2. Edit `data/models.json` (`inputPerMtok` / `outputPerMtok` / `cachedInputPerMtok`,
   `contextTokens`).
3. Bump `data/meta.json` → `lastUpdated`; add new `sources`.
4. `bun run check` then `bun run build`.
5. Open `dist/index.html` (or deploy `dist/`).

`bun run dev` rebuilds automatically on `data/` changes. **Shut the server down once the
user has approved the result** (see AGENTS.md server-shutdown rule).

## Current state

- 7 providers seeded: `github-copilot`, `anthropic-claude`, `cursor`, `openai-chatgpt`,
  `google-gemini`, `xai-grok`, `opencode`.
- 40 models seeded across Anthropic / OpenAI / Google / xAI / Z.ai / Moonshot AI / MiniMax labs.
- Every provider `primaryModels` entry resolves to a `model` row in `data/models.json`.
- **Cost calculator** (`#cost-calculator`, always visible):
  monthly token volume + input/output ratio slider + cached-input slider, with an
  "advanced" exact input/output split. It renders a sortable, click-to-sort table of every
  model's blended $/Mtok and estimated $/month, with text + lab filters, highlighting the
  cheapest. Model pricing is
  embedded as inline JSON so the page works over `file://` with no fetch. Defaults live in
  `DEFAULT_COST_INPUTS` (47.5M input + 2.5M output tokens, 95/5, 80% cached).
- Pipeline green: `bun run check`, `bun test` (14 tests), `bun run typecheck`, `bun run build`.
- `dist/` is generated and git-ignored.
- Hosted on **GitHub Pages** (`https://rjpcomputing.github.io/ai-provider-comparison/`)
  via `.github/workflows/deploy.yml`: CI rebuilds from `data/` and deploys `dist/` on every
  push to `master`. Pages source must be set to "GitHub Actions".

## Known caveats / TODO

- **Verify flagged numbers each month.** OpenAI "Go" pricing and current GPT/Gemini model
  IDs and rates are seeded from vendor pages at time of writing and flagged in `notes`;
  re-check before trusting them.
- Consumer plan "usage" is expressed in vendor-specific shapes; do not convert to tokens.
- xAI does not publish SuperGrok Lite (~$10) or SuperGrok Heavy ($300) prices; both are
  seeded from third-party figures and flagged in `notes`.
- Grok re-prices the whole request above the 200k-token threshold (input/output roughly
  double); the long-context rate is noted per model.
- Google's long-context rate card is a separate row (`Gemini 3.1 Pro (>200k)`); the base
  `Gemini 3.1 Pro` row carries the <=200k rate.
- Optional future work (data model already supports it):
  - charts (price-vs-capability, $/Mtok over time)
  - a `sources.json` / per-field provenance for each number
  - a `diff`/changelog view between `lastUpdated` snapshots

## How to continue development

1. Read `AGENTS.md` for rules and commands.
2. Change the **schema first** when the shape changes (`src/schema.ts`), then data, then
   renderer.
3. Keep everything typed; run `bun run typecheck`.
4. Always run the full gate before finishing:
   `bun run check && bun test && bun run typecheck && bun run build`.
5. If you started any local server for a demo/prototype, shut it down after the user
   selects a version.
