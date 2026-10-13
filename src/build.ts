import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadData } from "./load.ts";
import { renderDataJson, renderSite } from "./render.ts";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");

async function build(): Promise<void> {
  const data = loadData();

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  await Bun.write(join(DIST, "index.html"), renderSite(data));
  await Bun.write(join(DIST, "data.json"), renderDataJson(data));

  const result = await Bun.build({
    entrypoints: [join(ROOT, "src", "client", "main.ts")],
    outdir: DIST,
    target: "browser",
    minify: true,
    naming: "app.js",
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Client bundle failed");
  }

  copyFileSync(join(ROOT, "public", "styles.css"), join(DIST, "styles.css"));

  console.log(
    `Built ${data.providers.length} providers and ${data.models.length} models -> dist/ (last updated ${data.meta.lastUpdated})`,
  );
}

await build();
