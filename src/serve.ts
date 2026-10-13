import { watch } from "node:fs";
import { join, normalize, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const DATA = join(ROOT, "data");
const PORT = Number(process.env.PORT ?? 3000);

function rebuild(reason: string): void {
  console.log(`\n[dev] ${reason} — rebuilding…`);
  const proc = Bun.spawnSync(["bun", "run", join(import.meta.dir, "build.ts")], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (proc.exitCode !== 0) console.error("[dev] build failed; keeping previous output");
}

rebuild("initial build");

watch(DATA, { recursive: true }, (_event, filename) => rebuild(`data/${filename ?? ""} changed`));

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = resolve(DIST, "." + normalize(rel));
    if (!filePath.startsWith(DIST)) return new Response("Forbidden", { status: 403 });
    const file = Bun.file(filePath);
    if (await file.exists()) return new Response(file);
    return new Response("Not found", { status: 404 });
  },
});

console.log(`[dev] serving http://localhost:${server.port} (watching data/ for changes)`);
