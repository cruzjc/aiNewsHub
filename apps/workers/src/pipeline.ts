import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
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
  processEntities: false,
});
const secretsClient = new SecretsManagerClient({});
let cachedResolvedApiKey: string | null | undefined;
const feedRequestHeaders = {
  accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
  "user-agent": "aiNewsHub/1.0 (+https://github.com/cruzjc/aiNewsHub)",
};
const feedFetchTimeoutMs = 20_000;

const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const maxCandidatesPerSource = () => readPositiveInteger(process.env.MAX_CANDIDATES_PER_SOURCE, 8);
const maxCandidatesPerRun = () => readPositiveInteger(process.env.MAX_CANDIDATES_PER_RUN, 24);
const enrichmentConcurrency = () => readPositiveInteger(process.env.ENRICHMENT_CONCURRENCY, 4);

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

export const looksLikeFeedDocument = (body: string): boolean => /<(rss|feed)\b/i.test(body);

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

export const coerceStringList = (value: unknown, fallback: string[], limit = 8): string[] => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .flatMap((item) => {
      if (typeof item === "string") {
        return [item.trim()];
      }

      if (item && typeof item === "object") {
        for (const key of ["name", "label", "text", "title"]) {
          const candidate = (item as Record<string, unknown>)[key];
          if (typeof candidate === "string" && candidate.trim()) {
            return [candidate.trim()];
          }
        }
      }

      return [];
    })
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized.slice(0, limit) : fallback;
};

export const parseOpenAiSecretString = (secretValue: string): string | null => {
  const trimmed = secretValue.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string" && parsed.trim()) {
      return parsed.trim();
    }
    if (parsed && typeof parsed === "object") {
      for (const key of ["OPENAI_API_KEY", "apiKey", "openaiApiKey"]) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }
  } catch {
    return trimmed;
  }

  return null;
};

const resolveOpenAiApiKey = async (): Promise<string | null> => {
  const directApiKey = process.env.OPENAI_API_KEY?.trim();
  if (directApiKey) {
    return directApiKey;
  }

  if (cachedResolvedApiKey !== undefined) {
    return cachedResolvedApiKey;
  }

  const secretArn = process.env.OPENAI_SECRET_ARN?.trim();
  if (!secretArn) {
    cachedResolvedApiKey = null;
    return cachedResolvedApiKey;
  }

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretArn,
      }),
    );

    const secretPayload =
      response.SecretString ??
      (response.SecretBinary ? Buffer.from(response.SecretBinary).toString("utf-8") : "");

    cachedResolvedApiKey = secretPayload ? parseOpenAiSecretString(secretPayload) : null;
    return cachedResolvedApiKey;
  } catch (error) {
    console.error("failed to load OpenAI API key from Secrets Manager", error);
    cachedResolvedApiKey = null;
    return cachedResolvedApiKey;
  }
};

const enrichWithOpenAI = async (candidate: ArticleCandidate): Promise<Pick<Article, "summary" | "whyItMatters" | "tags" | "entities" | "confidenceScore" | "rankScore" | "enrichmentStatus">> => {
  const apiKey = await resolveOpenAiApiKey();
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
      tags: coerceStringList(parsed.tags, fallbackSummary(candidate).tags),
      entities: coerceStringList(parsed.entities, candidate.entities),
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

export const fetchSourceCandidates = async (source: Source): Promise<ArticleCandidate[]> => {
  try {
    const response = await fetch(source.feedUrl, {
      headers: feedRequestHeaders,
      signal: AbortSignal.timeout(feedFetchTimeoutMs),
    });
    if (!response.ok) {
      console.warn(`feed fetch returned ${response.status} for ${source.id} (${source.feedUrl})`);
      return [];
    }

    const payload = await response.text();
    if (!looksLikeFeedDocument(payload)) {
      console.warn(`feed payload did not look like RSS or Atom for ${source.id} (${source.feedUrl})`);
      return [];
    }

    return normalizeFeed(source, payload).slice(0, maxCandidatesPerSource());
  } catch (error) {
    console.error(`feed fetch failed for ${source.id} (${source.feedUrl})`, error);
    return [];
  }
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
};

export const runHourlyIngest = async (sources: Source[]) => {
  const fetched = await Promise.all(sources.map(fetchSourceCandidates));
  const deduped = dedupeCandidates(fetched.flat()).sort(
    (left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
  );
  const selected = deduped.slice(0, maxCandidatesPerRun());
  const articles = await mapWithConcurrency(selected, enrichmentConcurrency(), enrichCandidate);
  return articles.sort((left, right) => right.rankScore - left.rankScore);
};

export const writeSnapshot = async (articles: Article[]) => {
  const cacheDirectory = resolve(process.cwd(), "apps/workers/.cache");
  await mkdir(cacheDirectory, { recursive: true });
  await writeFile(resolve(cacheDirectory, "latest-ingest.json"), JSON.stringify(articles, null, 2));
};
