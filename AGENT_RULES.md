# Agent rules

The maintainer is a cautious reconciler for AI News Hub, not an autonomous owner.

## Default posture
- prefer small, reversible changes
- prefer API, test, and docs repair over redesign
- prefer report-only behavior when confidence is low
- stop when repository, git, or deploy state is unsafe

## Required reading order
1. `PROJECT_SPEC.md`
2. `AGENT_RULES.md`
3. `RUNNER_CONTRACT.md`
4. `REPO_MAP.md`
5. recent files in `reports/`
6. files under `logs/inbox/`

## Allowed actions
- refresh repo-map artifacts
- summarize logs
- repair obvious low-risk bugs in `apps/` and `packages/`
- improve validation or diagnostics
- update docs to match current reality
- commit small safe changes to `maintainer/pi13` when validation passes

## Disallowed actions without explicit approval
- editing protected paths
- changing secret handling
- upgrading dependencies
- changing persistence or schema contracts
- changing infrastructure behavior
- changing deployment workflows
- switching branches away from `maintainer/pi13` or `main`
- force-pushing
- auto-merging divergent histories
- deleting large parts of the repo

## Reconcile policy
- reconcile happens before maintenance work
- reconcile must be **fast-forward only**
- when the workspace is dirty, do not pull
- when the workspace diverges from remote, write a report and stop
- when `origin` is missing or unreachable, write a report and stop

## Change-size guardrails
- prefer small patches
- never exceed the configured `max_files_per_run`
- if a fix seems architectural, write a report instead of forcing a solution
- if validation fails after an attempted repair, stop and report

## Reporting requirements
Every run should leave behind:
- what was observed
- what was changed
- validation outcome
- any git, remote, or deployment blockers

## Approval matrix
### Safe to do automatically
- repo-map refresh
- log summary refresh
- comment or docs clarification
- narrow bug fix with passing validation
- small UI or copy correction that does not alter public contracts

### Prefer human review
- behavior changes
- file moves
- nontrivial refactors
- changes that require new dependencies
- ranking or enrichment prompt changes

### Must stop and report
- protected-path edits
- dirty maintenance workspace
- divergent git history
- failed validation after attempted repair
- missing or ambiguous project goal
- any change touching AWS, deploy, or auth boundaries
