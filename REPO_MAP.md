# Repo map

_Generated: 2026-04-12T11:22:12.111217+00:00_

## Top-level directories
- `.agent/`
- `.github/`
- `apps/`
- `config/`
- `data/`
- `docs/`
- `infra/`
- `logs/`
- `node_modules/`
- `packages/`
- `prompts/`
- `reconciler/`
- `reports/`
- `scripts/`
- `tests/`

## Top-level files
- `.gitignore`
- `.nvmrc`
- `AGENT_RULES.md`
- `AWS-Infrastructure.csv`
- `BOOTSTRAP_INSTRUCTIONS.md`
- `PROJECT_SPEC.md`
- `README.md`
- `REPO_MAP.md`
- `RUNNER_CONTRACT.md`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `repo_map.json`
- `tsconfig.base.json`

## Likely entrypoints
- `apps/api/src/lambda.ts`
- `apps/api/src/server.ts`
- `apps/mcp/src/http.ts`
- `apps/mcp/src/server.ts`
- `apps/web/src/main.tsx`
- `apps/web/vite.config.ts`
- `apps/workers/src/handlers.ts`
- `infra/bin/app.ts`
- `scripts/collect_logs.py`
- `scripts/invoke_agent.py`
- `scripts/pi_maintainer_agent.py`
- `scripts/run_maintenance.py`
- `scripts/update_repo_map.py`
- `scripts/validate.py`

## Python module summary
- `reconciler/__init__.py`: 0 functions, 0 classes, 0 imports
- `reconciler/agent_runner.py`: 1 functions, 0 classes, 4 imports
- `reconciler/common.py`: 14 functions, 0 classes, 8 imports
- `reconciler/gitops.py`: 4 functions, 1 classes, 4 imports
- `reconciler/log_ingest.py`: 2 functions, 0 classes, 3 imports
- `reconciler/mapping.py`: 7 functions, 2 classes, 7 imports
- `reconciler/runner.py`: 8 functions, 0 classes, 11 imports
- `scripts/collect_logs.py`: 0 functions, 0 classes, 4 imports
- `scripts/invoke_agent.py`: 1 functions, 0 classes, 5 imports
- `scripts/pi_maintainer_agent.py`: 8 functions, 0 classes, 11 imports
- `scripts/run_maintenance.py`: 0 functions, 0 classes, 3 imports
- `scripts/update_repo_map.py`: 0 functions, 0 classes, 3 imports
- `scripts/validate.py`: 3 functions, 0 classes, 5 imports
- `tests/test_runner_contract.py`: 6 functions, 1 classes, 8 imports
- `tests/test_scheduler_scripts.py`: 3 functions, 1 classes, 3 imports

## Internal dependency highlights
- `scripts/collect_logs.py` -> `reconciler.log_ingest`, `reconciler.runner`
- `scripts/invoke_agent.py` -> `reconciler.agent_runner`, `reconciler.runner`
- `scripts/pi_maintainer_agent.py` -> `reconciler.runner`
- `scripts/run_maintenance.py` -> `reconciler.runner`
- `scripts/update_repo_map.py` -> `reconciler.mapping`
- `tests/test_runner_contract.py` -> `reconciler.gitops`, `reconciler.mapping`, `reconciler.runner`

## TypeScript module summary
- `apps/api/src/app.test.ts`: 0 functions, 0 exports, 2 imports
- `apps/api/src/app.ts`: 2 functions, 2 exports, 4 imports
- `apps/api/src/lambda.ts`: 0 functions, 1 exports, 2 imports
- `apps/api/src/repository.ts`: 0 functions, 3 exports, 1 imports
- `apps/api/src/server.ts`: 0 functions, 0 exports, 2 imports
- `apps/mcp/src/http.ts`: 0 functions, 1 exports, 2 imports
- `apps/mcp/src/server.ts`: 0 functions, 0 exports, 1 imports
- `apps/mcp/src/stdio.ts`: 0 functions, 0 exports, 2 imports
- `apps/mcp/src/tools.ts`: 1 functions, 1 exports, 3 imports
- `apps/mcp/src/transport.ts`: 3 functions, 1 exports, 6 imports
- `apps/web/src/vite-env.d.ts`: 0 functions, 0 exports, 0 imports
- `apps/web/vite.config.ts`: 0 functions, 1 exports, 2 imports
- `apps/workers/src/handlers.ts`: 2 functions, 2 exports, 2 imports
- `apps/workers/src/index.ts`: 0 functions, 0 exports, 2 imports
- `apps/workers/src/pipeline.test.ts`: 0 functions, 0 exports, 3 imports
- `apps/workers/src/pipeline.ts`: 12 functions, 7 exports, 4 imports
- `apps/workers/src/source-registry.ts`: 1 functions, 1 exports, 2 imports
- `infra/bin/app.ts`: 0 functions, 0 exports, 2 imports
- `infra/lib/news-hub-stack.ts`: 0 functions, 1 exports, 17 imports
- `packages/schema/src/data.ts`: 1 functions, 10 exports, 1 imports
- `packages/schema/src/index.test.ts`: 0 functions, 0 exports, 3 imports
- `packages/schema/src/index.ts`: 0 functions, 2 exports, 2 imports
- `packages/schema/src/query.ts`: 7 functions, 6 exports, 1 imports
- `apps/web/src/App.tsx`: 3 functions, 1 exports, 2 imports
- `apps/web/src/main.tsx`: 0 functions, 0 exports, 3 imports

## Notes
- Runtime folders such as logs/, reports/, and .agent/runtime/ are intentionally excluded from dependency analysis.
- The generator focuses on Python and TypeScript structure plus top-level repository anatomy.
