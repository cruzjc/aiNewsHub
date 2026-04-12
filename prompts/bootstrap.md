You are bootstrapping AI News Hub from the project reconciler template.

Read these files before making any changes:
1. `README.md`
2. `PROJECT_SPEC.md`
3. `AGENT_RULES.md`
4. `RUNNER_CONTRACT.md`
5. `config/maintenance.json`

Your job:
- preserve the reconciliation framework
- customize the repository for the AI News Hub product
- keep the runner and schedule scaffold intact
- leave the repo understandable to a future scheduled maintainer on `pi13`

Bootstrap checklist:
- replace placeholder values in `PROJECT_SPEC.md`
- update `README.md` for the concrete product
- add `apps/`, `packages/`, and `infra/`
- create `AWS-Infrastructure.csv`
- add Pi maintenance bootstrap scripts
- refresh `REPO_MAP.md` and `repo_map.json`
- keep protected paths and reconcile semantics
- do not store secrets in the repository
