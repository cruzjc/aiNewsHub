# Runner contract

Contract version: **1**

This file freezes the stable interface for the periodic maintainer.

## Canonical entrypoint

```bash
python scripts/run_maintenance.py --mode scheduled
```

Schedulers should call that command and nothing more elaborate than that.

## Stable phases

1. **lock**
   - prevent overlapping runs

2. **reconcile**
   - fetch configured remote
   - fast-forward only when safe
   - stop on dirty or diverged workspaces

3. **map**
   - refresh `repo_map.json`
   - refresh `REPO_MAP.md`

4. **observe**
   - summarize recent logs into `logs/inbox/`

5. **agent**
   - optionally call the configured maintenance agent command

6. **validate**
   - run the configured validation command

7. **report**
   - write a timestamped report
   - update the latest-run state

## Required inputs

- `PROJECT_SPEC.md`
- `AGENT_RULES.md`
- `RUNNER_CONTRACT.md`
- `config/maintenance.json`
- `prompts/maintenance.md`

Optional but expected:
- `repo_map.json`
- `REPO_MAP.md`
- recent reports
- files under `logs/`

## Stable outputs

- `reports/<timestamp>.md`
- `reports/latest_report.md`
- `repo_map.json`
- `REPO_MAP.md`
- `.agent/last_run.json`
- `.agent/runtime/preflight.json`
- `logs/inbox/log_summary.json`

## Stable lock behavior

Lock file:
- `.agent/maintenance.lock`

Behavior:
- if the lock exists and is still fresh, exit with code `3`
- stale locks may be replaced

## Stable exit codes

- `0` = success with meaningful work or a clean successful run
- `2` = no-op or report-only stop
- `3` = lock held / overlapping run
- `4` = config invalid
- `5` = validation failed
- `6` = agent invocation failed

## Side-effect boundaries

The runner may:
- refresh generated artifacts
- write reports and runtime state
- reconcile via fast-forward only
- invoke the configured agent command

The runner must not:
- auto-merge divergent histories
- edit protected paths on its own
- assume cloud APIs for logs unless the project explicitly adds them
- destroy ignored runtime state via destructive cleanup

## Git assumptions

- Git remote is the source of truth for durable code changes
- local logs and runtime state are local truth for machine observation
- a dedicated maintenance checkout is strongly recommended

## Compatibility note

The scheduler layer is intentionally dumb.

Cron, Windows Task Scheduler, or a future automation service should all behave as thin wrappers around the canonical entrypoint above.
