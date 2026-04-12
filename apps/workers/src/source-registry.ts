import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { seedSources, sourceSchema, type Source } from "@ainewshub/schema";

const parseRegistry = (raw: string): Source[] => {
  const parsed = JSON.parse(raw) as unknown;
  return sourceSchema.array().parse(parsed);
};

export const loadSourceRegistry = (): Source[] => {
  if (process.env.SOURCE_REGISTRY_JSON) {
    return parseRegistry(process.env.SOURCE_REGISTRY_JSON);
  }

  const registryPath = resolve(process.cwd(), "config/source-registry.json");

  try {
    return parseRegistry(readFileSync(registryPath, "utf-8"));
  } catch {
    return sourceSchema.array().parse(seedSources);
  }
};
