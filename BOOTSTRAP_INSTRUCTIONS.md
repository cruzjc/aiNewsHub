# Bootstrap instructions

Use this file when shaping the template into the AI News Hub product.

## Goal
Preserve the reconciler framework while turning the repository into an AWS-hosted, agent-first news platform with a Pi13 maintenance checkout.

## Recommended workflow

1. **Human workspace**
   - work in `/mnt/e/Projects/aiNewsHub`
   - keep the reconciler files intact
   - treat `apps/`, `packages/`, `infra/`, and `config/source-registry.json` as the core product surface

2. **Read before changing**
   - `README.md`
   - `PROJECT_SPEC.md`
   - `AGENT_RULES.md`
   - `RUNNER_CONTRACT.md`
   - `config/maintenance.json`

3. **Bootstrap tasks**
   - create the TypeScript workspace
   - add API, MCP, web, worker, and infra packages
   - keep validation and repo-map refresh working
   - create or update `AWS-Infrastructure.csv`
   - keep the Pi maintainer bootstrap scripts aligned with the repo contract

4. **Review**
   - inspect `REPO_MAP.md` and `repo_map.json`
   - run `python scripts/validate.py`
   - confirm API and MCP contract parity

5. **Dedicated maintenance checkout**
   - use `pi13` only
   - preferred checkout path: `~/maintainers/ai-news-hub-runner`
   - install cron only after the checkout has a valid `origin` remote and the maintainer env is configured

## Bootstrap boundaries

The bootstrap task may:
- replace placeholder docs and config values
- add project-specific folders and source files
- update the validation command to cover the TypeScript workspace
- add Pi bootstrap and maintainer helper scripts

The bootstrap task should not:
- remove the runner contract
- remove schedule scripts
- replace reconcile semantics with blind pull or merge behavior
- store secrets in the repo
- grant the scheduled maintainer direct AWS deploy authority
