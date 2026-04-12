import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";

describe("api app", () => {
  const app = createApp();

  it("returns health", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
  });

  it("lists articles with filters", async () => {
    const response = await app.request("/v1/articles?topic=ai&limit=2");
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.meta.limit).toBe(2);
    expect(payload.data.every((article: { topics: string[] }) => article.topics.includes("ai"))).toBe(true);
  });

  it("returns a single article", async () => {
    const response = await app.request("/v1/articles/article-chip-supply-rebound");
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.id).toBe("article-chip-supply-rebound");
  });
});
