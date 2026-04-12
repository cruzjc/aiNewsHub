import { loadSourceRegistry } from "./source-registry.js";
import { runHourlyIngest } from "./pipeline.js";

export const hourlyIngestHandler = async () => {
  const sources = loadSourceRegistry();
  const articles = await runHourlyIngest(sources);
  return {
    articleCount: articles.length,
    generatedAt: new Date().toISOString(),
  };
};

export const enrichBatchHandler = async () => {
  return {
    status: "noop",
    detail: "queue-driven persistence is the next integration step",
  };
};
