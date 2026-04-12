import type { Article, ArticleListQuery, Source, Topic } from "./data.js";

const dateInRange = (article: Article, query: ArticleListQuery): boolean => {
  const published = Date.parse(article.publishedAt);
  if (query.publishedFrom && published < Date.parse(query.publishedFrom)) {
    return false;
  }
  if (query.publishedTo && published > Date.parse(query.publishedTo)) {
    return false;
  }
  return true;
};

export const filterArticles = (articles: Article[], query: ArticleListQuery): Article[] => {
  const search = query.search?.toLowerCase();
  return articles
    .filter((article) => !query.topic || article.topics.includes(query.topic))
    .filter((article) => !query.source || article.sourceId === query.source)
    .filter((article) => !query.language || article.language === query.language)
    .filter((article) => dateInRange(article, query))
    .filter((article) => {
      if (!search) {
        return true;
      }
      const haystack = [
        article.title,
        article.summary,
        article.whyItMatters,
        article.tags.join(" "),
        article.entities.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((left, right) => {
      if (right.rankScore !== left.rankScore) {
        return right.rankScore - left.rankScore;
      }
      return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    });
};

export const encodeCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset }), "utf-8").toString("base64url");

export const decodeCursor = (cursor?: string): number => {
  if (!cursor) {
    return 0;
  }
  try {
    const payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as { offset?: number };
    return typeof payload.offset === "number" && payload.offset >= 0 ? payload.offset : 0;
  } catch {
    return 0;
  }
};

export const paginateArticles = (articles: Article[], query: ArticleListQuery) => {
  const filtered = filterArticles(articles, query);
  const offset = decodeCursor(query.cursor);
  const page = filtered.slice(offset, offset + query.limit);
  const nextOffset = offset + page.length;
  return {
    items: page,
    nextCursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : null,
    total: filtered.length,
  };
};

export const getArticleById = (articles: Article[], articleId: string): Article | undefined =>
  articles.find((article) => article.id === articleId);

export const listTopics = (articles: Article[], sources: Source[]): Topic[] => {
  const values = new Set<Topic>();
  for (const article of articles) {
    for (const topic of article.topics) {
      values.add(topic);
    }
  }
  for (const source of sources) {
    for (const topic of source.topics) {
      values.add(topic);
    }
  }
  return Array.from(values).sort();
};
