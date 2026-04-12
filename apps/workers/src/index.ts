import { loadSourceRegistry } from "./source-registry.js";
import { runHourlyIngest, writeSnapshot } from "./pipeline.js";

const command = process.argv[2] ?? "help";

if (command === "ingest") {
  const sources = loadSourceRegistry();
  const articles = await runHourlyIngest(sources);
  console.log(JSON.stringify({ articleCount: articles.length, articles }, null, 2));
} else if (command === "snapshot") {
  const sources = loadSourceRegistry();
  const articles = await runHourlyIngest(sources);
  await writeSnapshot(articles);
  console.log(`wrote ${articles.length} enriched articles to apps/workers/.cache/latest-ingest.json`);
} else {
  console.log("usage: pnpm dev:workers -- ingest|snapshot");
}
