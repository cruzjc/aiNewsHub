import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { articleListQuerySchema } from "@ainewshub/schema";

import { defaultRepository, type NewsRepository } from "./repository.js";

const parseArticleQuery = (query: Record<string, string | undefined>) =>
  articleListQuerySchema.parse({
    limit: query.limit,
    cursor: query.cursor,
    topic: query.topic,
    source: query.source,
    search: query.search,
    language: query.language,
    publishedFrom: query.publishedFrom,
    publishedTo: query.publishedTo,
  });

export const createApp = (repository: NewsRepository = defaultRepository) => {
  const app = new Hono();

  app.onError((error, context) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    return context.json(
      {
        error: "internal_error",
        detail: error instanceof Error ? error.message : "unknown error",
      },
      500,
    );
  });

  app.get("/health", (context) =>
    context.json({
      status: "ok",
      service: "ai-news-hub-api",
    }),
  );

  app.get("/v1/articles", (context) => {
    const query = parseArticleQuery(context.req.query());
    const page = repository.listArticles(query);
    return context.json({
      data: page.items,
      meta: {
        nextCursor: page.nextCursor,
        total: page.total,
        limit: query.limit,
      },
    });
  });

  app.get("/v1/articles/:id", (context) => {
    const article = repository.getArticle(context.req.param("id"));
    if (!article) {
      throw new HTTPException(404, { message: "article not found" });
    }
    return context.json({ data: article });
  });

  app.get("/v1/sources", (context) =>
    context.json({
      data: repository.listSources(),
    }),
  );

  app.get("/v1/topics", (context) =>
    context.json({
      data: repository.listTopics(),
    }),
  );

  return app;
};

export const app = createApp();
