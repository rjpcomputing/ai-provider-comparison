import type { Model, Plan, Provider, Usage } from "./schema.ts";
import type { SiteData } from "./load.ts";
import {
  DEFAULT_COST_INPUTS,
  blendedRatePerMtok,
  estimateMonthlyCost,
  formatUsd,
} from "./cost.ts";

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function money(n: number): string {
  if (n === 0) return "Free";
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

function int(n: number): string {
  return n.toLocaleString("en-US");
}

function usageLabel(u: Usage): string {
  switch (u.kind) {
    case "ai_credits":
      return u.units != null ? `${int(u.units)} AI credits/mo` : "AI credits/mo";
    case "requests":
      return u.units != null ? `${int(u.units)} requests/mo` : "Requests/mo";
    case "sessions":
      return "Session-capped";
    case "tokens":
      return "Token-metered";
    case "unmetered":
      return "Included / rate-limited";
    case "byok":
      return "Bring your own key";
  }
}

function cheapestPaid(plans: Plan[]): number {
  const paid = plans.map((p) => p.priceMonthly).filter((v) => v > 0);
  return paid.length > 0 ? Math.min(...paid) : 0;
}

function hasFree(plans: Plan[]): boolean {
  return plans.some((p) => p.priceMonthly === 0);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanizeReasoning(r: "lightweight" | "versatile" | "powerful" | "specialized" | "extended"): string {
  switch (r) {
    case "lightweight":
      return "Lightweight";
    case "versatile":
      return "Versatile";
    case "powerful":
      return "Powerful";
    case "specialized":
      return "Specialized";
    case "extended":
      return "Extended";
  }
}

function overviewRow(p: Provider, modelMap: Map<string, string>): string {
  const entry = cheapestPaid(p.plans);
  const priceText = hasFree(p.plans)
    ? `${money(entry)}/mo (Free tier)`
    : `${money(entry)}/mo`;
  const tiers = p.plans
    .map((pl) => `${esc(pl.name)} ${esc(money(pl.priceMonthly))}`)
    .join(" · ");
  const usage = p.plans
    .filter((pl) => pl.priceMonthly > 0 && pl.includedUsage.units != null)
    .map((pl) => `${esc(pl.name)}: ${esc(usageLabel(pl.includedUsage))}`)
    .join("<br>");

  const primary = p.primaryModels
    .map((mname) => {
      const id = modelMap.get(mname);
      if (id) {
        return `<a href="#model-${esc(id)}">${esc(mname)}</a>`;
      }
      return esc(mname);
    })
    .join(", ");

  return `<tr>
    <td data-sort-value="${esc(p.name)}"><a href="#${esc(p.id)}">${esc(p.name)}</a></td>
    <td data-sort-value="${entry}">${esc(priceText)}</td>
    <td>${tiers}</td>
    <td>${usage || `<a href="#${esc(p.id)}-plans">See plan table</a>`}</td>
    <td>${primary}</td>
  </tr>`;
}

function planTable(p: Provider): string {
  const rows = p.plans
    .map((pl) => {
      const annual =
        pl.priceAnnual != null ? `${money(pl.priceAnnual)}/yr` : '<span class="muted">-</span>';
      return `<tr>
        <td>${esc(pl.name)}</td>
        <td data-sort-value="${pl.priceMonthly}">${esc(money(pl.priceMonthly))}<span class="muted">/mo</span></td>
        <td>${annual}</td>
        <td>${esc(usageLabel(pl.includedUsage))}${
          pl.includedUsage.note ? `<div class="muted">${esc(pl.includedUsage.note)}</div>` : ""
        }</td>
        <td>${esc(pl.limits)}${pl.notes ? `<div class="muted">${esc(pl.notes)}</div>` : ""}</td>
      </tr>`;
    })
    .join("");
  return `<div class="table-wrap" id="${esc(p.id)}-plans"><table class="data-table">
    <thead><tr><th>Plan</th><th>Price</th><th>Annual</th><th>Included usage</th><th>Limits</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function providerCard(p: Provider): string {
  const pros = p.pros.map((x) => `<li>${esc(x)}</li>`).join("");
  const cons = p.cons.map((x) => `<li>${esc(x)}</li>`).join("");
  return `<article class="card" id="${esc(p.id)}">
    <header class="card-head">
      <div>
        <h3>${esc(p.name)}</h3>
        <p class="vendor">${esc(p.vendor)} · <a href="${esc(p.url)}" target="_blank" rel="noopener">website</a></p>
      </div>
    </header>
    <p>${esc(p.summary)}</p>
    <div class="proscons">
      <div><h4>Pros</h4><ul class="pros">${pros}</ul></div>
      <div><h4>Cons</h4><ul class="cons">${cons}</ul></div>
    </div>
    <h4>Plans &amp; pricing</h4>
    ${planTable(p)}
  </article>`;
}

function modelRow(m: Model, providerIds: Set<string>): string {
  const cached =
    m.cachedInputPerMtok != null ? `$${m.cachedInputPerMtok}` : '<span class="muted">-</span>';
  const chinaTag = m.countryOfOrigin === "China" ? `<span class="tag tag-origin cn">China</span>` : "";
  const rowId = slug(m.model);
  const available = m.availableVia
    .map((v) => {
      if (providerIds.has(v)) {
        return `<a class="tag" href="#${esc(v)}">${esc(v)}</a>`;
      }
      return `<span class="tag">${esc(v)}</span>`;
    })
    .join(" ");
  return `<tr id="model-${esc(rowId)}" data-origin="${esc(m.countryOfOrigin)}">
    <td data-sort-value="${esc(m.model)}">${esc(m.model)} ${chinaTag}${
      m.notes ? `<div class="muted">${esc(m.notes)}</div>` : ""
    }</td>
    <td data-sort-value="${esc(m.lab)}">${esc(m.lab)}</td>
    <td data-sort-value="${esc(m.reasoningLevel)}">${esc(humanizeReasoning(m.reasoningLevel))}</td>
    <td data-sort-value="${m.inputPerMtok}">$${m.inputPerMtok}</td>
    <td data-sort-value="${m.outputPerMtok}">$${m.outputPerMtok}</td>
    <td data-sort-value="${m.cachedInputPerMtok ?? -1}">${cached}</td>
    <td data-sort-value="${m.contextTokens}">${int(m.contextTokens)}</td>
    <td>${available}</td>
  </tr>`;
}

function costModelsJson(models: Model[]): string {
  const payload = models.map((m) => ({
    model: m.model,
    lab: m.lab,
    inputPerMtok: m.inputPerMtok,
    outputPerMtok: m.outputPerMtok,
    cachedInputPerMtok: m.cachedInputPerMtok,
  }));
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

function costRow(m: Model, inputs = DEFAULT_COST_INPUTS, best = false): string {
  const cost = estimateMonthlyCost(m, inputs);
  const blended = blendedRatePerMtok(m, inputs);
  return `<tr id="calc-${esc(slug(m.model))}" data-model="${esc(m.model)}"${best ? ' class="best"' : ""}>
    <td data-sort-value="${esc(m.model)}">${esc(m.model)}</td>
    <td data-sort-value="${esc(m.lab)}">${esc(m.lab)}</td>
    <td data-sort-value="${m.inputPerMtok}">$${m.inputPerMtok}</td>
    <td data-sort-value="${m.outputPerMtok}">$${m.outputPerMtok}</td>
    <td class="calc-blended" data-sort-value="${blended}">$${blended.toFixed(2)}</td>
    <td class="calc-est" data-sort-value="${cost}">${esc(formatUsd(cost))}</td>
  </tr>`;
}

function costCalculator(models: Model[]): string {
  const inputs = DEFAULT_COST_INPUTS;
  const total = inputs.inputTokensPerMonth + inputs.outputTokensPerMonth;
  const share = total > 0 ? Math.round((inputs.inputTokensPerMonth / total) * 100) : 0;
  const cachedPct = Math.round(inputs.cachedShare * 100);
  const labs = [...new Set(models.map((m) => m.lab))].sort();
  const sorted = [...models].sort((a, b) => estimateMonthlyCost(a, inputs) - estimateMonthlyCost(b, inputs));
  const rows = sorted.map((m, i) => costRow(m, inputs, i === 0)).join("");
  return `<section id="cost-calculator">
  <h2>Cost calculator</h2>
  <p class="hint">Estimate a monthly API bill from a blended input/output token ratio. Adjust the volume, ratio and cache hit-rate — every model's estimate updates live.</p>
  <div class="calculator">
    <div class="calc-controls">
      <label class="calc-field">Monthly tokens
        <input id="calc-tokens" type="number" min="0" step="1000000" inputmode="numeric" value="${total}">
      </label>
      <label class="calc-field">Input : output ratio
        <input id="calc-ratio" type="range" min="0" max="100" step="1" value="${share}">
        <output id="calc-ratio-out">Input ${share}% / Output ${100 - share}%</output>
      </label>
      <label class="calc-field">Cached input
        <input id="calc-cached" type="range" min="0" max="100" step="1" value="${cachedPct}">
        <output id="calc-cached-out">${cachedPct}% of input tokens cached</output>
      </label>
      <details class="calc-advanced">
        <summary>Advanced: exact token split</summary>
        <div class="calc-advanced-fields">
          <label class="calc-field">Input tokens/mo
            <input id="calc-input-tokens" type="number" min="0" step="100000" inputmode="numeric" value="${inputs.inputTokensPerMonth}">
          </label>
          <label class="calc-field">Output tokens/mo
            <input id="calc-output-tokens" type="number" min="0" step="100000" inputmode="numeric" value="${inputs.outputTokensPerMonth}">
          </label>
        </div>
      </details>
    </div>
    <div class="filters">
      <input class="filter" type="search" data-filter="cost-results" placeholder="Filter models…" aria-label="Filter cost calculator models">
      <select class="filter" data-filter-select="cost-results" aria-label="Filter by lab">
        <option value="">All labs</option>
        ${labs.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}
      </select>
    </div>
    <div class="table-wrap"><table class="data-table" id="cost-results">
      <thead><tr>
        <th data-col="0" data-sort="text" data-type="text">Model</th>
        <th data-col="1" data-sort="text" data-type="text">Lab</th>
        <th data-col="2" data-sort="number" data-type="number">Input $/Mtok</th>
        <th data-col="3" data-sort="number" data-type="number">Output $/Mtok</th>
        <th data-col="4" data-sort="number" data-type="number">Blended $/Mtok</th>
        <th data-col="5" data-sort="number" data-type="number">Est. $/month</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="hint">Cheapest estimate is highlighted. Costs use list API rates and assume every non-cached input token bills at the input rate.</p>
  </div>
  <script type="application/json" id="cost-models">${costModelsJson(models)}</script>
</section>`;
}

function sourcesList(sources: string[]): string {
  if (sources.length === 0) return "";
  return `<details class="sources"><summary>Sources (${sources.length})</summary><ul>${sources
    .map((s) => `<li><a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a></li>`)
    .join("")}</ul></details>`;
}

/** Render the full static site as a single HTML document. */
export function renderSite(data: SiteData): string {
  const { meta, providers, models } = data;
  const providerIds = new Set(providers.map((p) => p.id));
  const modelMap = new Map<string, string>(models.map((m) => [m.model, slug(m.model)]));
  const overview = providers.map((p) => overviewRow(p, modelMap)).join("");
  const cards = providers.map(providerCard).join("");
  const modelRows = models.map((m) => modelRow(m, providerIds)).join("");
  const labs = [...new Set(models.map((m) => m.lab))].sort();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<meta name="description" content="Compare AI providers on pricing, included usage, primary models and per-token costs.">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="site-head">
  <div class="topbar-inner">
    <h1>${esc(meta.title)}</h1>
    <nav class="toc" aria-label="On this page">
      <span class="toc-label">On this page</span>
      <a href="#overview">Overview</a>
      <a href="#model-costs">Model costs</a>
      <a href="#cost-calculator">Cost calculator</a>
      <a href="#providers">Provider details</a>
      <a href="#methodology">Methodology</a>
    </nav>
  </div>
</header>

<section class="hero">
  <p class="subtitle">Pricing, included monthly usage, primary models and per-token costs across ${providers.length} providers.</p>
  <p class="updated">Last updated <strong>${esc(meta.lastUpdated)}</strong> · all prices in ${esc(meta.currency)}</p>
</section>

<main>
<section id="overview">
  <h2>Overview</h2>
  <input class="filter" type="search" data-filter="overview-table" placeholder="Filter providers…" aria-label="Filter providers">
  <div class="table-wrap"><table class="data-table" id="overview-table">
    <thead><tr>
      <th data-col="0" data-sort="text" data-type="text">Provider</th>
      <th data-col="1" data-sort="number" data-type="number">Entry price</th>
      <th data-col="2" data-sort="text" data-type="text">Tiers</th>
      <th data-col="3" data-sort="text" data-type="text">Included monthly usage</th>
      <th data-col="4" data-sort="text" data-type="text">Primary models</th>
    </tr></thead>
    <tbody>${overview}</tbody>
  </table></div>
  <p class="hint">Click a column header to sort. Usage types differ (credits vs requests vs session windows vs tokens) — see <a href="#methodology">methodology</a>.</p>
</section>

<section id="model-costs">
  <h2>Model costs (API rates, per 1M tokens)</h2>
  <div class="filters">
    <input class="filter" type="search" data-filter="models-table" placeholder="Filter models…" aria-label="Filter models">
    <select class="filter" data-filter-select="models-table" aria-label="Filter by lab">
      <option value="">All labs</option>
      ${labs.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}
    </select>
  </div>
  <div class="table-wrap"><table class="data-table" id="models-table">
    <thead><tr>
      <th data-col="0" data-sort="text" data-type="text">Model</th>
      <th data-col="1" data-sort="text" data-type="text">Lab</th>
      <th data-col="2" data-sort="text" data-type="text">Reasoning</th>
      <th data-col="3" data-sort="number" data-type="number">Input $/Mtok</th>
      <th data-col="4" data-sort="number" data-type="number">Output $/Mtok</th>
      <th data-col="5" data-sort="number" data-type="number">Cached $/Mtok</th>
      <th data-col="6" data-sort="number" data-type="number">Context</th>
      <th data-col="7" data-sort="text" data-type="text">Available via</th>
    </tr></thead>
    <tbody>${modelRows}</tbody>
  </table></div>
  <p class="hint">Subscription tools (Copilot, Cursor, Claude plans) resell these models through credits or session limits; API keys bill at these rates directly.</p>
</section>

${costCalculator(models)}

<section id="providers">
  <h2>Provider details</h2>
  ${cards}
</section>

<section id="methodology">
  <h2>Methodology &amp; caveats</h2>
  <ul>
    <li><strong>Included monthly usage</strong> is reported in whatever unit the vendor uses. There is no universal "tokens per month" across subscriptions: Copilot and Cursor meter <em>AI credits/requests</em>, Claude and ChatGPT meter <em>5-hour and weekly session windows</em>, and APIs meter raw <em>tokens</em>. Treat credit/session allowances as indicative, not directly comparable.</li>
    <li><strong>Model costs</strong> are list API prices per 1M tokens (input / output / cached input). Subscription overage is often billed at these same rates.</li>
    <li><strong>Annual</strong> figures are the total yearly charge where an annual plan exists.</li>
    <li>Prices exclude tax and are subject to change. Verify against each vendor before committing spend.</li>
  </ul>
  ${sourcesList(meta.sources)}
</section>
</main>

<footer class="site-foot">
  <p>Generated from <code>data/*.json</code> · schema v${meta.schemaVersion} · last updated ${esc(meta.lastUpdated)}.</p>
</footer>

<script src="app.js"></script>
</body>
</html>
`;
}

/** The raw validated data, emitted alongside the site for reuse/reference. */
export function renderDataJson(data: SiteData): string {
  return JSON.stringify(data, null, 2);
}
