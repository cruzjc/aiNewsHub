import { startTransition, useDeferredValue, useEffect, useState } from "react";

import { seedArticles, seedSources, type Article, type Source } from "@ainewshub/schema";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const fallbackTopics = Array.from(new Set(seedArticles.flatMap((article) => article.topics))).sort();
const articleDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

type FeedState = {
  articles: Article[];
  sources: Source[];
  topics: string[];
  loading: boolean;
  error: string | null;
};

const defaultState: FeedState = {
  articles: seedArticles,
  sources: seedSources,
  topics: fallbackTopics,
  loading: true,
  error: null,
};

const buildQuery = (search: string, topic: string, source: string) => {
  const params = new URLSearchParams();
  params.set("limit", "24");
  if (search) {
    params.set("search", search);
  }
  if (topic !== "all") {
    params.set("topic", topic);
  }
  if (source !== "all") {
    params.set("source", source);
  }
  return params.toString();
};

export function App() {
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const [source, setSource] = useState("all");
  const [state, setState] = useState(defaultState);

  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const controller = new AbortController();

    const articlesUrl = `${API_BASE}/v1/articles?${buildQuery(deferredSearch, topic, source)}`;
    const sourcesUrl = `${API_BASE}/v1/sources`;
    const topicsUrl = `${API_BASE}/v1/topics`;

    Promise.all([
      fetch(articlesUrl, { signal: controller.signal }),
      fetch(sourcesUrl, { signal: controller.signal }),
      fetch(topicsUrl, { signal: controller.signal }),
    ])
      .then(async ([articlesResponse, sourcesResponse, topicsResponse]) => {
        if (!articlesResponse.ok || !sourcesResponse.ok || !topicsResponse.ok) {
          throw new Error("failed to fetch news hub data");
        }
        const [articlesPayload, sourcesPayload, topicsPayload] = await Promise.all([
          articlesResponse.json(),
          sourcesResponse.json(),
          topicsResponse.json(),
        ]);

        startTransition(() => {
          setState({
            articles: articlesPayload.data,
            sources: sourcesPayload.data,
            topics: topicsPayload.data,
            loading: false,
            error: null,
          });
        });
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        startTransition(() => {
          setState({
            articles: seedArticles,
            sources: seedSources,
            topics: fallbackTopics,
            loading: false,
            error: "Live API unavailable. Showing bundled seed data.",
          });
        });
      });

    return () => controller.abort();
  }, [deferredSearch, source, topic]);

  return (
    <div className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Agent-first broad news infrastructure</p>
          <h1>AI News Hub</h1>
          <p className="hero-body">
            Curated hourly news for models, agents, and operators. The feed is ranked, link-first, and structured to
            be easy to ingest.
          </p>
          <div className="hero-links">
            <a href={`${API_BASE}/v1/articles`} target="_blank" rel="noreferrer">
              Open JSON API
            </a>
            <a href="/llms.txt" target="_blank" rel="noreferrer">
              Read llms.txt
            </a>
          </div>
        </div>
        <div className="hero-rail">
          <div>
            <span>Coverage</span>
            <strong>Allowlisted global feeds</strong>
          </div>
          <div>
            <span>Cadence</span>
            <strong>Hourly ingest and ranking</strong>
          </div>
          <div>
            <span>Surface</span>
            <strong>JSON API + MCP + web</strong>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="controls" aria-label="Filters">
          <label>
            Search
            <input
              value={search}
              onChange={(event) => {
                const next = event.currentTarget.value;
                startTransition(() => setSearch(next));
              }}
              placeholder="Search titles, tags, or entities"
            />
          </label>
          <label>
            Topic
            <select value={topic} onChange={(event) => setTopic(event.currentTarget.value)}>
              <option value="all">All topics</option>
              {state.topics.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select value={source} onChange={(event) => setSource(event.currentTarget.value)}>
              <option value="all">All sources</option>
              {state.sources.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="status-row">
          <p>{state.loading ? "Refreshing feed…" : `${state.articles.length} ranked articles in view.`}</p>
          {state.error ? <p className="warning">{state.error}</p> : null}
        </section>

        <section className="feed" aria-label="News feed">
          {state.articles.map((article) => (
            <article key={article.id} className="feed-item">
              <div className="feed-meta">
                <span>{article.sourceName}</span>
                <time dateTime={article.publishedAt}>{articleDate.format(new Date(article.publishedAt))}</time>
              </div>
              <div className="feed-body">
                <div className="feed-headline">
                  <h2>{article.title}</h2>
                  <span className="rank">rank {article.rankScore}</span>
                </div>
                <p>{article.summary}</p>
                <p className="why">{article.whyItMatters}</p>
                <div className="chip-row">
                  {article.topics.map((entry) => (
                    <span key={`${article.id}-${entry}`}>{entry}</span>
                  ))}
                </div>
              </div>
              <div className="feed-link">
                <a href={article.outboundUrl} target="_blank" rel="noreferrer">
                  Open source
                </a>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
