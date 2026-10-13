# AGENTS.md

Guidance for AI agents and developers working in this repository.

## What this repo is

A **data-driven static website** that compares AI providers (GitHub Copilot, Anthropic
Claude, Cursor, OpenAI, Google Gemini, xAI Grok, opencode) on pricing, included monthly
usage, primary models, and per-token model costs.

The website is **generated** from JSON in `data/`. There is no CMS, database, or runtime
backend. Monthly refresh = edit JSON → `bun run build`.

## Toolchain

- **Bun** is the only runtime/package manager/build tool. Do **not** introduce npm, pnpm,
  yarn, or Node-only tooling.
- **TypeScript** everywhere, strict mode. Browser code is bundled by `Bun.build`.
- **Zod** validates all data at build time.
- Runtime deps: `zod`. Dev deps: `typescript`, `@types/bun`. Keep dependency count minimal.

## Commands

```bash
bun install          # install deps
bun run build        # validate data + render dist/ + bundle dist/app.js
bun run check        # validate data only (no output)
bun run refresh      # diff model prices vs live feeds (dry-run; -- --write applies)
bun test             # data integrity tests
bun run typecheck    # tsc --noEmit
bun run dev          # serve dist/ on :3000, rebuild on data/ change
```

Before finishing any change, run: `bun run check && bun test && bun run typecheck && bun run build` — and confirm the README/CONTEXT provider & model counts still match.

## Deployment

Hosted on GitHub Pages at <https://rjpcomputing.github.io/ai-provider-comparison/>.
`.github/workflows/deploy.yml` runs the full gate above and deploys `dist/` via the official
Pages actions on every push to `master` (plus `workflow_dispatch`). Never commit `dist/`;
the workflow rebuilds it. Pages source must be set to "GitHub Actions" in repo settings.

## Repo layout

```
data/                 # source of truth, edited monthly (NOT generated)
  meta.json           # title, currency, lastUpdated, schemaVersion, sources
  providers.json      # array of providers: plans, usage, pros/cons, primary models
  models.json         # array of models: input/output/cached $/Mtok, context
src/
  schema.ts           # Zod schemas + inferred TS types (single source of truth)
  load.ts             # reads + validates data/*.json -> SiteData
  render.ts           # typed HTML renderers (overview, cards, model table)
  build.ts            # build entrypoint -> dist/
  validate.ts         # validation-only entrypoint
  serve.ts            # dev server (Bun.serve), watches data/
  refresh.ts          # auto-refresh model prices from live feeds (CLI)
  feeds/              # feed adapters: modelsdev.ts, openrouter.ts, litellm.ts
  client/main.ts      # table sort/filter, bundled to dist/app.js
public/styles.css     # styles (copied to dist/)
tests/data.test.ts    # data integrity tests
dist/                 # generated output (git-ignored) — never edit by hand
```

## Golden rules

1. **Never edit `dist/` by hand.** It is generated and git-ignored. Change `data/` or `src/`
   and rebuild.
2. **The data shape lives in `src/schema.ts`.** If you add/rename a field, update the Zod
   schema first; `z.infer` propagates the types. Update `data/*.json` and the README schema
   docs to match.
3. **Validate, don't assume.** New data must pass `bun run check`. Bad data should fail the
   build with a clear message — do not silently coerce.
4. **No comments in source** unless they explain non-obvious intent (matches repo style).
5. **Keep it dependency-light.** Prefer Bun built-ins (`Bun.file`, `Bun.build`, `Bun.serve`,
   `bun test`) over adding libraries.
6. **Docs move with the data.** Any change to `data/*.json` or `src/schema.ts` must update the
   matching docs in the same change: `README.md` (provider list, data-model section, workflow)
   and `CONTEXT.md` (purpose list, "Current state" counts, caveats). A stale count or missing
   provider in the docs is a bug — doc sync is part of "done".

## The server-shutdown rule (important)

Whenever you start a local server — for **tests, prototypes, previews, or a dev server**
(`bun run dev`, `Bun.serve`, or any port-bound process) — you MUST shut it down once the
user has **selected/approved the version** they want.

- After the user picks a version, immediately stop the running server (kill the process /
  free the port). Do not leave it running in the background.
- Do not leave servers running between tasks "just in case". Start it for the demo, stop it
  when a choice is made.
- If multiple prototypes/ports were started for comparison, shut **all** of them down after
  selection.
- Verify it is stopped (e.g. the port no longer responds) before considering the task done.

Rationale: orphaned dev servers hold ports, consume resources, and cause confusing stale
state on the next run.

## Adding a provider (example workflow)

1. Add an entry to `data/providers.json` with a unique kebab-case `id`.
2. Add its models to `data/models.json` (or reuse existing ones), listing the provider id in
   `availableVia`.
3. Add sources to `data/meta.json`.
4. Update the docs: add the provider to `README.md` and `CONTEXT.md` (purpose list + Current
   state counts).
5. `bun run check` → `bun test` → `bun run build`.
