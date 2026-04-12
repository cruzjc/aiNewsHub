import { describe, expect, it } from "vitest";

import { paginateArticles, seedArticles, seedSources } from "./index.js";
import { listTopics } from "./query.js";

describe("schema helpers", () => {
  it("filters and paginates seeded articles", () => {
    const result = paginateArticles(seedArticles, { limit: 2, topic: "business" });
    expect(result.items).toHaveLength(2);
    expect(result.items.every((article) => article.topics.includes("business"))).toBe(true);
    expect(result.nextCursor).not.toBeNull();
  });

  it("builds a stable topic list", () => {
    expect(listTopics(seedArticles, seedSources)).toContain("ai");
    expect(listTopics(seedArticles, seedSources)).toContain("sports");
  });
});
