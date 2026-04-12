import { describe, expect, it } from "vitest";

import type { ArticleCandidate } from "./pipeline.js";
import { dedupeCandidates, enrichCandidate, normalizeFeed } from "./pipeline.js";
import { loadSourceRegistry } from "./source-registry.js";

describe("worker pipeline", () => {
  it("normalizes rss entries", () => {
    const [source] = loadSourceRegistry();
    const items = normalizeFeed(
      source,
      `<?xml version="1.0"?>
      <rss>
        <channel>
          <item>
            <title>Compute policy expands</title>
            <link>https://example.com/a</link>
            <description>Government and labs respond to new compute export rules.</description>
            <pubDate>Tue, 12 Apr 2026 04:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.topics).toContain("politics");
  });

  it("dedupes duplicate entries", () => {
    const candidates = [
      {
        title: "Same item",
        outboundUrl: "https://example.com/a",
        sourceId: "src",
        sourceName: "Source",
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        summary: "Summary",
        whyItMatters: "Why it matters",
        topics: ["world"],
        tags: ["world"],
        entities: [],
        language: "en",
        excerpt: "Summary",
      } satisfies ArticleCandidate,
      {
        title: "Same item",
        outboundUrl: "https://example.com/a?ref=dup",
        sourceId: "src",
        sourceName: "Source",
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        summary: "Summary",
        whyItMatters: "Why it matters",
        topics: ["world"],
        tags: ["world"],
        entities: [],
        language: "en",
        excerpt: "Summary",
      } satisfies ArticleCandidate,
    ];
    expect(dedupeCandidates(candidates)).toHaveLength(1);
  });

  it("falls back when OpenAI is not configured", async () => {
    const candidate: ArticleCandidate = {
      title: "Fallback example",
      outboundUrl: "https://example.com/fallback",
      sourceId: "src",
      sourceName: "Source",
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      summary: "Summary",
      whyItMatters: "Why",
      topics: ["ai"],
      tags: ["ai"],
      entities: ["Source"],
      language: "en",
      excerpt: "Fallback example excerpt",
    };
    const article = await enrichCandidate(candidate);
    expect(article.enrichmentStatus).toBe("fallback");
  });
});
