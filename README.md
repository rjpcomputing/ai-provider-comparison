# AI Provider Comparison

A data-driven static website that compares AI providers (GitHub Copilot, Anthropic Claude,
Cursor, OpenAI, Google Gemini, xAI Grok, opencode, …) on **pricing, included monthly usage,
primary models, and per-token model costs** — plus a **cost calculator** that
turns a blended input/output token ratio into a per-model monthly estimate.

The site is generated from JSON files in `data/`. To refresh it each month you edit those
files and run one command — no HTML editing, no framework.

## Requirements

- [Bun](https://bun.sh) (developed against v1.4)

## Quick start

```bash
bun install          # install dependencies (zod, TypeScript)
bun run build        # validate data + generate the site into dist/
open dist/index.html # or: bun run dev  -> http://localhost:3000
```

## Scripts

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `bun run build`     | Validate `data/`, render `dist/index.html`, bundle `dist/app.js`    |
| `bun run check`     | Validate `data/` only (no output written)                           |
| `bun test`          | Run the data/test suite                                             |
| `bun run typecheck` | `tsc --noEmit` across `src/` and `tests/`                           |
| `bun run dev`       | Serve `dist/` on http://localhost:3000 and rebuild when `data/` changes |

## Deployment

The site is published to **GitHub Pages** by `.github/workflows/deploy.yml`. On every push
to `master` (and on manual `workflow_dispatch`), CI installs with Bun, runs
`bun run check`, `bun test`, `bun run typecheck` and `bun run build`, then deploys `dist/`
with the official Pages actions. Generated output is never committed.

- Live URL: <https://rjpcomputing.github.io/ai-provider-comparison/>
- One-time setup: **Settings → Pages → Source: GitHub Actions**.

## Project layout

```
data/                 # <-- the ONLY files you edit each month
  meta.json           # title, currency, lastUpdated, schema version, sources
  providers.json      # per-provider plans, usage, pros/cons, primary models
  models.json         # per-model API token prices, context, availability
src/
  schema.ts           # Zod schemas + inferred TypeScript types (source of truth)
  load.ts             # reads + validates data/*.json
  cost.ts             # pure monthly-cost estimator (blended token mix)
  render.ts           # HTML renderers
  build.ts            # build entrypoint -> dist/
  validate.ts         # validation-only entrypoint
  serve.ts            # dev server (Bun.serve)
  client/main.ts      # table sort/filter + cost calculator (bundled to dist/app.js)
public/styles.css     # site styles (copied to dist/)
tests/data.test.ts    # data integrity tests
dist/                 # generated output (git-ignored)
```

## Monthly update workflow

1. **Edit `data/providers.json`** — update `plans` (prices, `includedUsage`, `limits`),
   and refresh `pros`/`cons` and `primaryModels` if the offering changed.
2. **Edit `data/models.json`** — update `inputPerMtok` / `outputPerMtok` /
   `cachedInputPerMtok` and `contextTokens` for any model price changes.
  3. **Bump `data/meta.json`** → set `lastUpdated` to the current timestamp (e.g. `"2026-11-01T09:00:00Z"` or `"2026-11-01"`) and
     add any new `sources`.
4. **Update the docs** — if provider/model counts or the data shape changed, refresh the
   provider list in `README.md` and the "Current state" counts in `CONTEXT.md`.
5. **Rebuild:** `bun run build`.
6. Open `dist/index.html` (or commit/deploy `dist/`).

Run `bun run check` first if you want to validate without building.

## Data model

### `providers.json` (array)

```jsonc
{
  "id": "github-copilot",           // kebab-case, unique, used as anchor id
  "name": "GitHub Copilot",
  "vendor": "GitHub / Microsoft",
  "url": "https://github.com/features/copilot",
  "summary": "one-line description",
  "pros": ["..."],
  "cons": ["..."],
  "primaryModels": ["GPT-5.6", "Claude Sonnet"],
  "plans": [
    {
      "name": "Pro",
      "priceMonthly": 10,           // USD
      "priceAnnual": null,          // total annual charge, or null
      "currency": "USD",
      "includedUsage": {
        "kind": "ai_credits",       // ai_credits | requests | sessions | tokens | unmetered | byok
        "units": 1500,              // number, or null if unspecified
        "note": "1,000 base + 500 flex; overage $0.01/credit"
      },
      "limits": "1,500 AI credits/mo",
      "notes": "optional extra context"
    }
  ]
}
```

### `models.json` (array)

```jsonc
{
  "model": "Claude Sonnet 4.6",
  "lab": "Anthropic",
  "inputPerMtok": 3,                // USD per 1M input tokens
  "outputPerMtok": 15,              // USD per 1M output tokens
  "cachedInputPerMtok": 0.3,        // or null
  "contextTokens": 200000,
  "availableVia": ["anthropic-api", "opencode-zen", "github-copilot", "cursor"],
  "reasoningLevel": "versatile",
  "countryOfOrigin": "US",
  "notes": "optional"
}
```

`availableVia` values name the surfaces a model is resold through: `anthropic-api`,
`openai-api`, `gemini-api`, `xai-api`, `opencode-zen`, `github-copilot`, `cursor`.

### Why `includedUsage.kind` matters

Subscriptions do **not** all meter the same way, so the site never pretends they do:

- `ai_credits` — Copilot / Cursor style credit pools
- `requests` — per-request allowances
- `sessions` — Claude / ChatGPT style 5-hour + weekly windows
- `tokens` — raw token metering
- `unmetered` — included but rate-limited
- `byok` — bring your own key (you pay the API directly)

All data is validated at build time with Zod, so a typo (wrong type, missing field, bad
date) fails the build with a clear error instead of shipping broken numbers.
