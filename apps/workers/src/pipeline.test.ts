import { afterEach, describe, expect, it, vi } from "vitest";

import type { Source } from "@ainewshub/schema";

import type { ArticleCandidate } from "./pipeline.js";
import {
  coerceStringList,
  dedupeCandidates,
  enrichCandidate,
  looksLikeFeedDocument,
  normalizeFeed,
  parseOpenAiSecretString,
  runHourlyIngest,
} from "./pipeline.js";
import { loadSourceRegistry } from "./source-registry.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  delete process.env.MAX_CANDIDATES_PER_RUN;
});

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

  it("parses a raw secret string", () => {
    expect(parseOpenAiSecretString("sk-test-123")).toBe("sk-test-123");
  });

  it("parses a json secret payload", () => {
    expect(parseOpenAiSecretString(JSON.stringify({ OPENAI_API_KEY: "sk-json-123" }))).toBe("sk-json-123");
  });

  it("coerces model lists into plain strings", () => {
    expect(
      coerceStringList(
        ["Alpha", { name: "Beta" }, { label: "Gamma" }, { text: "Delta" }, { title: "Epsilon" }],
        [],
      ),
    ).toEqual(["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]);
  });

  it("recognizes feed-shaped payloads", () => {
    expect(looksLikeFeedDocument("<rss><channel /></rss>")).toBe(true);
    expect(looksLikeFeedDocument("<feed><entry /></feed>")).toBe(true);
    expect(looksLikeFeedDocument("<html><body>not a feed</body></html>")).toBe(false);
  });

  it("continues ingest when one source fetch fails", async () => {
    const sources: Source[] = [
      {
        id: "broken-source",
        name: "Broken Source",
        homepageUrl: "https://example.com/broken",
        feedUrl: "https://example.com/broken.xml",
        language: "en",
        topics: ["world"],
        priority: 5,
      },
      {
        id: "healthy-source",
        name: "Healthy Source",
        homepageUrl: "https://example.com/healthy",
        feedUrl: "https://example.com/healthy.xml",
        language: "en",
        topics: ["technology"],
        priority: 6,
      },
    ];

    vi.spyOn(console, "error").mockImplementation(() => undefined);

    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(
          `<?xml version="1.0"?>
          <rss>
            <channel>
              <item>
                <title>Healthy item</title>
                <link>https://example.com/articles/healthy-item</link>
                <description>Chip policy and compute markets move together.</description>
                <pubDate>Tue, 12 Apr 2026 04:00:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`,
          {
            status: 200,
            headers: {
              "content-type": "text/xml",
            },
          },
        ),
      ) as typeof fetch;

    const articles = await runHourlyIngest(sources);
    expect(articles).toHaveLength(1);
    expect(articles[0]?.sourceId).toBe("healthy-source");
    expect(articles[0]?.enrichmentStatus).toBe("fallback");
  });

  it("limits the number of candidates enriched per run", async () => {
    const sources: Source[] = [
      {
        id: "alpha-source",
        name: "Alpha Source",
        homepageUrl: "https://example.com/alpha",
        feedUrl: "https://example.com/alpha.xml",
        language: "en",
        topics: ["world"],
        priority: 5,
      },
      {
        id: "beta-source",
        name: "Beta Source",
        homepageUrl: "https://example.com/beta",
        feedUrl: "https://example.com/beta.xml",
        language: "en",
        topics: ["business"],
        priority: 6,
      },
    ];

    process.env.MAX_CANDIDATES_PER_RUN = "1";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    globalThis.fetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            `<?xml version="1.0"?>
            <rss>
              <channel>
                <item>
                  <title>Shared headline</title>
                  <link>https://example.com/articles/shared-headline</link>
                  <description>Markets, policy, and climate move together.</description>
                  <pubDate>Tue, 12 Apr 2026 05:00:00 GMT</pubDate>
                </item>
                <item>
                  <title>Second headline</title>
                  <link>https://example.com/articles/second-headline</link>
                  <description>Technology and AI leadership shifts.</description>
                  <pubDate>Tue, 12 Apr 2026 04:30:00 GMT</pubDate>
                </item>
              </channel>
            </rss>`,
            {
              status: 200,
              headers: {
                "content-type": "text/xml",
              },
            },
          ),
      ) as typeof fetch;

    const articles = await runHourlyIngest(sources);
    expect(articles).toHaveLength(1);
  });
});
