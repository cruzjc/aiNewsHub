# Project spec

## Project
- **Name**: `aiNewsHub`
- **Purpose**: publish broad, structured, agent-ingestible news from allowlisted sources
- **Primary user / operator**: AI agents, developer operators, and human reviewers who need a machine-first news surface

## Goal
Maintain a public news hub that reliably ingests hourly news from approved feeds, exposes a stable JSON API and read-only MCP surface, and remains safe for a scheduled maintainer to reconcile and repair.

## In scope
- public JSON API for articles, sources, and topics
- read-only MCP server with tool parity to the API
- minimal public website optimized for agent-readable browsing
- allowlisted feed and API ingest
- structured summaries, ranking, tagging, and enrichment fallbacks
- AWS infrastructure definitions for the production stack
- Pi13 dedicated maintenance checkout and scheduled reconciler workflow

## Out of scope
- unrestricted web crawling
- direct article full-text mirroring
- user accounts, billing, or per-agent auth
- editorial CMS or manual review UI
- breaking-news real-time streaming
- autonomous infrastructure or deployment changes from the scheduled maintainer

## Constraints
- runtime / platform:
  - Node `22` for the product workspace
  - Python `3.10+` for the reconciler
  - AWS managed serverless as the production target
  - `pi13` as the only scheduled maintainer host in v1
- language / framework:
  - TypeScript workspace with React for the web app
  - Hono for HTTP services
  - AWS CDK for infrastructure definitions
- external APIs / services:
  - allowlisted RSS feeds and publisher APIs only
  - OpenAI API for enrichment when credentials are configured
  - GitHub remote and token required for maintainer branch push and PR creation

## Acceptance checks
The maintainer should use these as the default definition of "good".

- `python scripts/validate.py` passes
- repo-map files match the actual repository shape
- API and MCP surfaces share the same article contract
- source registry remains allowlist-only
- no autonomous run edits protected paths
- the Pi maintainer can stop cleanly and report on dirty or diverged workspaces

## Protected paths
These paths should not be edited automatically without explicit approval.

- `.env`
- `.env.*`
- `secrets/`
- `.git/`
- `infra/`
- `.github/workflows/`
- `AWS-Infrastructure.csv`
- `deployment/live/`

## Safe automatic changes
These are allowed once the scheduled maintainer is enabled.

- repo-map refresh
- log summary refresh
- documentation updates that match current code
- low-risk bug fixes in `apps/` or `packages/`
- non-invasive validation or diagnostic improvements
- test repairs that do not change public behavior

## Unsafe automatic changes
These require explicit review first.

- dependency upgrades
- schema or persistence model changes
- deploy workflow edits
- auth or token-handling changes
- infrastructure behavior changes
- large refactors or architecture rewrites

## Runtime and logging
- **Maintenance checkout location**: `~/maintainers/ai-news-hub-runner`
- **Log backend**: `local`
- **Primary log folders**: `logs/` and `logs/inbox/`

## Open questions
- the production GitHub remote still needs to exist before the Pi can reconcile and push maintenance branches end-to-end
- the exact OpenAI model and budget policy should be finalized when live enrichment is enabled
