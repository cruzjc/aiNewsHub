# AI News Hub

AI News Hub is an agent-first news service built for machine consumption first and human browsing second.

The repository combines two concerns:

- a public news platform with JSON API, read-only MCP server, workers, and a minimal web surface
- a durable reconciler scaffold that lets `pi13` maintain a dedicated checkout safely on an hourly schedule

## Product shape

- Coverage: broad-spectrum news from allowlisted mainstream and popular sources
- Output: single-article records with structured metadata, outbound links, and agent-readable summaries
- Freshness: hourly ingest
- Delivery: AWS-hosted API, MCP, and static site
- Archive: full retained history

## Repository layout

```text
.
├── apps/
│   ├── api/        # Public JSON API
│   ├── mcp/        # Read-only MCP server
│   ├── web/        # Agent-friendly public site
│   └── workers/    # Feed ingest, dedupe, and enrichment
├── infra/          # AWS CDK app
├── packages/
│   └── schema/     # Shared schemas, seed data, and query helpers
├── config/
│   ├── maintenance.json
│   └── source-registry.json
├── scripts/        # Reconciler entrypoints, validation, Pi bootstrap, maintainer wrapper
├── reconciler/     # Template maintenance framework
├── logs/
├── reports/
└── .agent/
```

## Public interfaces

### HTTP JSON API

- `GET /health`
- `GET /v1/articles`
- `GET /v1/articles/{id}`
- `GET /v1/sources`
- `GET /v1/topics`

### MCP tools

- `list_articles`
- `get_article`
- `list_sources`
- `list_topics`

## Local development

### Prerequisites

- Node `22`
- `pnpm` `10.x` via `corepack`
- Python `3.10+`

### Commands

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install
pnpm dev:api
pnpm dev:web
pnpm dev:mcp
pnpm dev:workers -- --help
python3 scripts/validate.py
```

The default local API runs on `http://localhost:3001`.

## AWS shape

The planned production footprint is tracked in [AWS-Infrastructure.csv](/mnt/e/Projects/aiNewsHub/AWS-Infrastructure.csv).

Core services:

- `S3 + CloudFront` for the public site and `llms.txt`
- `API Gateway + Lambda` for the HTTP API and MCP endpoint
- `EventBridge + Step Functions + SQS + Lambda` for ingestion and enrichment
- `DynamoDB` for the article and source archive
- `Secrets Manager` for the OpenAI API key

## Pi13 maintainer

The scheduled maintainer belongs on a dedicated checkout:

- target host: `pi13`
- checkout path: `~/maintainers/ai-news-hub-runner`
- schedule: `15 * * * *`
- command: `python scripts/run_maintenance.py --mode scheduled`

The runner:

- reconciles from `main` with fast-forward-only semantics
- refreshes repo-map artifacts
- summarizes logs
- invokes `scripts/pi_maintainer_agent.py`
- validates the repository
- writes timestamped reports under `reports/`

The Pi maintainer may only make small safe changes, commit them to `maintainer/pi13`, and push or open a PR when a GitHub remote and token are configured.

## Remote and deploy expectations

- durable code changes should land in Git
- production deploys should happen from GitHub Actions after reviewed merges to `main`
- the Pi should not run live AWS deploy commands

If no remote exists yet, the Pi bootstrap can still copy a maintenance checkout, but reconcile, branch push, and PR creation remain blocked until `origin` points to a real repository.

## Maintainer notes

- read [PROJECT_SPEC.md](/mnt/e/Projects/aiNewsHub/PROJECT_SPEC.md), [AGENT_RULES.md](/mnt/e/Projects/aiNewsHub/AGENT_RULES.md), [RUNNER_CONTRACT.md](/mnt/e/Projects/aiNewsHub/RUNNER_CONTRACT.md), and [config/maintenance.json](/mnt/e/Projects/aiNewsHub/config/maintenance.json) first
- keep `infra/`, `.github/workflows/`, secrets, and live env files out of autonomous edits
- prefer reports over risky changes
