import { readFileSync } from "node:fs";

import { sourceSchema, type Source } from "@ainewshub/schema";

const registryPath = new URL("../../../config/source-registry.json", import.meta.url);

export const loadSourceRegistry = (): Source[] => {
  const raw = JSON.parse(readFileSync(registryPath, "utf-8")) as unknown;
  return sourceSchema.array().parse(raw);
};
