/** Client-side table sorting and filtering. Bundled by Bun.build into dist/app.js. */

import {
  blendedRatePerMtok,
  estimateMonthlyCost,
  formatUsd,
  type CostInputs,
} from "../cost.ts";

function cellValue(row: HTMLTableRowElement, col: number): string {
  const cell = row.cells[col];
  if (!cell) return "";
  return cell.dataset.sortValue ?? cell.textContent?.trim() ?? "";
}

function sortByColumn(
  table: HTMLTableElement,
  col: number,
  numeric: boolean,
  dir: 1 | -1,
): void {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const rows = Array.from(tbody.rows);
  rows.sort((a, b) => {
    const av = cellValue(a, col);
    const bv = cellValue(b, col);
    if (numeric) {
      return ((Number.parseFloat(av) || 0) - (Number.parseFloat(bv) || 0)) * dir;
    }
    return av.localeCompare(bv, undefined, { numeric: true }) * dir;
  });
  for (const row of rows) tbody.appendChild(row);
}

function initSorting(): void {
  for (const table of document.querySelectorAll<HTMLTableElement>("table.data-table")) {
    const headers = Array.from(
      table.querySelectorAll<HTMLTableCellElement>("thead th[data-sort]"),
    );
    for (const th of headers) {
      th.classList.add("sortable");
      th.addEventListener("click", () => {
        const col = Number(th.dataset.col ?? 0);
        const numeric = th.dataset.type === "number";
        const dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;

        for (const h of headers) h.removeAttribute("aria-sort");
        th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
        sortByColumn(table, col, numeric, dir);
      });
    }
  }
}

function applyFilters(): void {
  const textInputs = document.querySelectorAll<HTMLInputElement>("input[data-filter]");
  const selects = document.querySelectorAll<HTMLSelectElement>("select[data-filter-select]");

  const state = new Map<string, { text: string; lab: string }>();
  const getState = (id: string) => {
    let s = state.get(id);
    if (!s) {
      s = { text: "", lab: "" };
      state.set(id, s);
    }
    return s;
  };

  const run = (tableId: string) => {
    const table = document.getElementById(tableId) as HTMLTableElement | null;
    const tbody = table?.tBodies[0];
    if (!tbody) return;
    const { text, lab } = getState(tableId);
    const needle = text.toLowerCase();
    for (const row of Array.from(tbody.rows) as HTMLTableRowElement[]) {
      const matchesText = needle === "" || row.textContent?.toLowerCase().includes(needle);
      const matchesLab = lab === "" || row.textContent?.includes(lab);
      row.hidden = !(matchesText && matchesLab);
    }
  };

  for (const input of textInputs) {
    const id = input.dataset.filter ?? "";
    input.addEventListener("input", () => {
      getState(id).text = input.value;
      run(id);
    });
  }
  for (const select of selects) {
    const id = select.dataset.filterSelect ?? "";
    select.addEventListener("change", () => {
      getState(id).lab = select.value;
      run(id);
    });
  }
}

function initTocHighlight(): void {
  const pairs = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("nav.toc a[href^='#']"),
  )
    .map((link) => {
      const section = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      return section ? { link, section } : null;
    })
    .filter((p): p is { link: HTMLAnchorElement; section: HTMLElement } => p !== null);
  const first = pairs[0];
  const last = pairs[pairs.length - 1];
  if (!first || !last) return;

  const setActive = (id: string) => {
    for (const { link } of pairs) {
      link.classList.toggle("active", link.hash === `#${id}`);
    }
  };

  const update = () => {
    const threshold = window.innerHeight * 0.35;
    let current = first.section.id;
    for (const { section } of pairs) {
      if (section.getBoundingClientRect().top <= threshold) current = section.id;
    }
    const atBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) current = last.section.id;
    setActive(current);
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
}

interface CalcModel {
  model: string;
  lab: string;
  inputPerMtok: number;
  outputPerMtok: number;
  cachedInputPerMtok: number | null;
}

function num(el: HTMLInputElement | null): number {
  const value = Number(el?.value ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function initCalculator(): void {
  const table = document.getElementById("cost-results") as HTMLTableElement | null;
  const dataEl = document.getElementById("cost-models");
  const tbody = table?.tBodies[0];
  if (!table || !dataEl || !tbody) return;

  let models: CalcModel[];
  try {
    models = JSON.parse(dataEl.textContent ?? "[]") as CalcModel[];
  } catch {
    return;
  }
  const byModel = new Map(models.map((m) => [m.model, m]));
  const rows = Array.from(tbody.rows) as HTMLTableRowElement[];

  const tokensEl = document.getElementById("calc-tokens") as HTMLInputElement | null;
  const ratioEl = document.getElementById("calc-ratio") as HTMLInputElement | null;
  const ratioOut = document.getElementById("calc-ratio-out");
  const cachedEl = document.getElementById("calc-cached") as HTMLInputElement | null;
  const cachedOut = document.getElementById("calc-cached-out");
  const inputEl = document.getElementById("calc-input-tokens") as HTMLInputElement | null;
  const outputEl = document.getElementById("calc-output-tokens") as HTMLInputElement | null;
  if (!tokensEl || !ratioEl || !cachedEl || !inputEl || !outputEl) return;

  let exactMode = false;

  const refresh = (): void => {
    let inputTokens: number;
    let outputTokens: number;
    if (exactMode) {
      inputTokens = num(inputEl);
      outputTokens = num(outputEl);
      const total = inputTokens + outputTokens;
      const share = total > 0 ? Math.round((inputTokens / total) * 100) : 0;
      tokensEl.value = String(total);
      ratioEl.value = String(share);
    } else {
      const total = num(tokensEl);
      const share = num(ratioEl) / 100;
      inputTokens = total * share;
      outputTokens = total * (1 - share);
      inputEl.value = String(Math.round(inputTokens));
      outputEl.value = String(Math.round(outputTokens));
    }

    const cachedShare = num(cachedEl) / 100;
    const ratioPct = num(ratioEl);
    if (ratioOut) ratioOut.textContent = `Input ${ratioPct}% / Output ${100 - ratioPct}%`;
    if (cachedOut) {
      cachedOut.textContent = `${Math.round(cachedShare * 100)}% of input tokens cached`;
    }

    const inputs: CostInputs = {
      inputTokensPerMonth: inputTokens,
      outputTokensPerMonth: outputTokens,
      cachedShare,
    };

    let bestCost = Number.POSITIVE_INFINITY;
    let bestRow: HTMLTableRowElement | null = null;
    for (const row of rows) {
      const model = byModel.get(row.dataset.model ?? "");
      if (!model) continue;
      const cost = estimateMonthlyCost(model, inputs);
      const blended = blendedRatePerMtok(model, inputs);
      const est = row.querySelector<HTMLTableCellElement>(".calc-est");
      if (est) {
        est.textContent = formatUsd(cost);
        est.dataset.sortValue = String(cost);
      }
      const blend = row.querySelector<HTMLTableCellElement>(".calc-blended");
      if (blend) {
        blend.textContent = `$${blended.toFixed(2)}`;
        blend.dataset.sortValue = String(blended);
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestRow = row;
      }
    }
    for (const row of rows) row.classList.toggle("best", row === bestRow);
    resort();
  };

  const resort = (): void => {
    const active = table.querySelector<HTMLTableCellElement>("thead th[aria-sort]");
    if (active) {
      const col = Number(active.dataset.col ?? 0);
      const numeric = active.dataset.type === "number";
      const dir = active.getAttribute("aria-sort") === "ascending" ? 1 : -1;
      sortByColumn(table, col, numeric, dir as 1 | -1);
    } else {
      sortByColumn(table, 5, true, 1);
    }
  };

  tokensEl.addEventListener("input", () => {
    exactMode = false;
    refresh();
  });
  ratioEl.addEventListener("input", () => {
    exactMode = false;
    refresh();
  });
  cachedEl.addEventListener("input", refresh);
  inputEl.addEventListener("input", () => {
    exactMode = true;
    refresh();
  });
  outputEl.addEventListener("input", () => {
    exactMode = true;
    refresh();
  });

  refresh();
}

initSorting();
applyFilters();
initTocHighlight();
initCalculator();
