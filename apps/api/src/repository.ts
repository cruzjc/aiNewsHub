import {
  articleListQuerySchema,
  getArticleById,
  listTopics,
  paginateArticles,
  seedArticles,
  seedSources,
  type Article,
  type ArticleListQuery,
  type Source,
} from "@ainewshub/schema";

export interface NewsRepository {
  listArticles(query: ArticleListQuery): {
    items: Article[];
    nextCursor: string | null;
    total: number;
  };
  getArticle(articleId: string): Article | undefined;
  listSources(): Source[];
  listTopics(): string[];
}

export class InMemoryNewsRepository implements NewsRepository {
  private readonly articles = seedArticles;
  private readonly sources = seedSources;

  listArticles(query: ArticleListQuery) {
    const parsed = articleListQuerySchema.parse(query);
    return paginateArticles(this.articles, parsed);
  }

  getArticle(articleId: string) {
    return getArticleById(this.articles, articleId);
  }

  listSources() {
    return this.sources;
  }

  listTopics() {
    return listTopics(this.articles, this.sources);
  }
}

export const defaultRepository = new InMemoryNewsRepository();
