import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  articleListQuerySchema,
  getArticleById,
  listTopics,
  paginateArticles,
  seedArticles,
  seedSources,
  topicValues,
} from "@ainewshub/schema";

const buildTextResponse = <T extends Record<string, unknown>>(payload: T) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(payload, null, 2),
    },
  ],
  structuredContent: payload,
});

export const createNewsMcpServer = () => {
  const server = new McpServer({
    name: "ai-news-hub",
    version: "0.1.0",
  });

  server.registerTool(
    "list_articles",
    {
      title: "List Articles",
      description: "List ranked news articles with optional topic, source, search, and time filters.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
        cursor: z.string().optional(),
        topic: z.enum(topicValues).optional(),
        source: z.string().optional(),
        search: z.string().optional(),
        language: z.string().optional(),
        publishedFrom: z.string().optional(),
        publishedTo: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (input) => {
      const parsed = articleListQuerySchema.parse(input);
      const page = paginateArticles(seedArticles, parsed);
      return buildTextResponse({
        data: page.items,
        meta: {
          total: page.total,
          nextCursor: page.nextCursor,
          limit: parsed.limit,
        },
      });
    },
  );

  server.registerTool(
    "get_article",
    {
      title: "Get Article",
      description: "Fetch one article by its stable ID.",
      inputSchema: {
        articleId: z.string(),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ articleId }) => {
      const article = getArticleById(seedArticles, articleId);
      if (!article) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "article_not_found", articleId }, null, 2),
            },
          ],
          isError: true,
        };
      }

      return buildTextResponse({
        data: article,
      });
    },
  );

  server.registerTool(
    "list_sources",
    {
      title: "List Sources",
      description: "List the allowlisted news sources available in the hub.",
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      return buildTextResponse({
        data: seedSources,
      });
    },
  );

  server.registerTool(
    "list_topics",
    {
      title: "List Topics",
      description: "List the normalized topics currently represented in the feed and source registry.",
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      return buildTextResponse({
        data: listTopics(seedArticles, seedSources),
      });
    },
  );

  return server;
};
