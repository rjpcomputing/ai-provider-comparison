import { loadData } from "./load.ts";

try {
  const data = loadData();
  console.log(
    `OK: ${data.providers.length} providers, ${data.models.length} models. Last updated ${data.meta.lastUpdated}.`,
  );
} catch (err) {
  console.error("Data validation failed:\n");
  if (err instanceof Error) {
    console.error(err.message);
    if (err.cause) console.error(err.cause);
  } else {
    console.error(err);
  }
  process.exit(1);
}
