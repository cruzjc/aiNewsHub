import { mkdir, writeFile } from "node:fs/promises";

import OpenAI from "openai";
import { XMLParser } from "fast-xml-parser";

import {
  articleSchema,
  type Article,
  type Source,
  type Topic,
} from "@ainewshub/schema";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

export type ArticleCandidate = Omit<Article, "id" | "rankScore" | "confidenceScore" | "enrichmentStatus"> & {
  excerpt?: string;
};

const classifyTopics = (text: string, source: Source): Topic[] => {
  const haystack = text.toLowerCase();
  const matches = new Set<Topic>(source.topics);

  if (haystack.includes("ai") || haystack.includes("model") || haystack.includes("chip")) {
    matches.add("ai");
    matches.add("technology");
  }
  if (haystack.includes("election") || haystack.includes("policy") || haystack.includes("government")) {
    matches.add("politics");
  }
  if (haystack.includes("market") || haystack.includes("stock") || haystack.includes("trade")) {
    matches.add("markets");
    matches.add("business");
  }
  if (haystack.includes("climate") || haystack.includes("heat") || haystack.includes("storm")) {
    matches.add("climate");
  }
  if (haystack.includes("health") || haystack.includes("hospital")) {
    matches.add("health");
  }
  if (haystack.includes("sport")) {
    matches.add("sports");
  }

  return Array.from(matches).sort();
};

const toArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const stripHtml = (value: string | undefined): string => (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export const buildDedupeKey = (candidate: Pick<ArticleCandidate, "title" | "outboundUrl">): string => {
  const normalizedTitle = candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const normalizedUrl = candidate.outboundUrl.toLowerCase().split("?")[0];
  return `${normalizedTitle}::${normalizedUrl}`;
};

export const normalizeFeed = (source: Source, feedXml: string): ArticleCandidate[] => {
  const parsed = parser.parse(feedXml) as {
    rss?: { channel?: { item?: Array<Record<string, unknown>> | Record<string, unknown> } };
    feed?: { entry?: Array<Record<string, unknown>> | Record<string, unknown> };
  };
  const items = toArray(parsed.rss?.channel?.item).concat(toArray(parsed.feed?.entry));
  const normalized: ArticleCandidate[] = [];

  for (const item of items) {
    const title = String(item.title ?? "").trim();
    const linkValue = item.link;
    const outboundUrl = String(
      (typeof linkValue === "object" && linkValue && "href" in linkValue ? linkValue.href : linkValue) ?? item.guid ?? "",
    ).trim();
    if (!title || !outboundUrl) {
      continue;
    }

    const excerpt = stripHtml(String(item.description ?? item.summary ?? item.content ?? ""));
    const publishedAt = String(item.pubDate ?? item.published ?? item.updated ?? new Date().toISOString());
    const topics = classifyTopics(`${title} ${excerpt}`, source);
    const entities = excerpt
      .split(" ")
      .filter((token) => token.length > 3 && /^[A-Z]/.test(token))
      .slice(0, 4);

    normalized.push({
      title,
      outboundUrl,
      sourceId: source.id,
      sourceName: source.name,
      publishedAt: new Date(publishedAt).toISOString(),
      discoveredAt: new Date().toISOString(),
      summary: excerpt.slice(0, 180) || `${title} from ${source.name}.`,
      whyItMatters: `This item was picked from ${source.name} for agent-readable coverage across ${topics.join(", ") || "general news"}.`,
      topics,
      tags: [...source.topics],
      entities,
      language: source.language,
      imageUrl: undefined,
      excerpt,
    });
  }

  return normalized;
};

export const dedupeCandidates = (candidates: ArticleCandidate[]): ArticleCandidate[] => {
  const seen = new Set<string>();
  const deduped: ArticleCandidate[] = [];
  for (const candidate of candidates) {
    const key = buildDedupeKey(candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
};

const fallbackSummary = (candidate: ArticleCandidate) => {
  const compactExcerpt = (candidate.excerpt ?? candidate.summary).slice(0, 240);
  return {
    summary: compactExcerpt || candidate.title,
    whyItMatters: `Agents following ${candidate.topics.join(", ") || "general news"} should track this because ${candidate.sourceName} surfaced it as a current development.`,
    tags: Array.from(new Set([...candidate.tags, ...candidate.topics])).slice(0, 8),
    entities: candidate.entities,
    confidenceScore: 0.62,
    rankScore: 60 + candidate.topics.length * 6,
    enrichmentStatus: "fallback" as const,
  };
};

const enrichWithOpenAI = async (candidate: ArticleCandidate): Promise<Pick<Article, "summary" | "whyItMatters" | "tags" | "entities" | "confidenceScore" | "rankScore" | "enrichmentStatus">> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackSummary(candidate);
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: "You produce short agent-readable news enrichment in strict JSON.",
      },
      {
        role: "user",
        content: JSON.stringify({
          title: candidate.title,
          source: candidate.sourceName,
          publishedAt: candidate.publishedAt,
          topics: candidate.topics,
          excerpt: candidate.excerpt ?? candidate.summary,
        }),
      },
    ],
  });

  const outputText = (response as { output_text?: string }).output_text;
  if (!outputText) {
    return fallbackSummary(candidate);
  }

  try {
    const parsed = JSON.parse(outputText) as {
      summary?: string;
      whyItMatters?: string;
      tags?: string[];
      entities?: string[];
      confidenceScore?: number;
      rankScore?: number;
    };
    return {
      summary: parsed.summary?.trim() || fallbackSummary(candidate).summary,
      whyItMatters: parsed.whyItMatters?.trim() || fallbackSummary(candidate).whyItMatters,
      tags: parsed.tags?.slice(0, 8) || fallbackSummary(candidate).tags,
      entities: parsed.entities?.slice(0, 8) || candidate.entities,
      confidenceScore: Math.min(1, Math.max(0, parsed.confidenceScore ?? 0.78)),
      rankScore: Math.max(0, parsed.rankScore ?? 82),
      enrichmentStatus: "enriched",
    };
  } catch {
    return fallbackSummary(candidate);
  }
};

export const enrichCandidate = async (candidate: ArticleCandidate): Promise<Article> => {
  const enrichment = await enrichWithOpenAI(candidate);
  return articleSchema.parse({
    id: `article-${buildDedupeKey(candidate)}`,
    ...candidate,
    summary: enrichment.summary,
    whyItMatters: enrichment.whyItMatters,
    tags: enrichment.tags,
    entities: enrichment.entities,
    confidenceScore: enrichment.confidenceScore,
    rankScore: enrichment.rankScore,
    enrichmentStatus: enrichment.enrichmentStatus,
  });
};

export const runHourlyIngest = async (sources: Source[]) => {
  const fetched = await Promise.all(
    sources.map(async (source) => {
      const response = await fetch(source.feedUrl);
      if (!response.ok) {
        return [];
      }
      const xml = await response.text();
      return normalizeFeed(source, xml);
    }),
  );
  const deduped = dedupeCandidates(fetched.flat());
  const articles = await Promise.all(deduped.map(enrichCandidate));
  return articles.sort((left, right) => right.rankScore - left.rankScore);
};

export const writeSnapshot = async (articles: Article[]) => {
  const cacheDirectory = new URL("../.cache/", import.meta.url);
  await mkdir(cacheDirectory, { recursive: true });
  await writeFile(new URL("latest-ingest.json", cacheDirectory), JSON.stringify(articles, null, 2));
};
