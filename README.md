# Factory Control Plane

Phase 8 of the autonomous engineering software factory. The goal of this phase is that one operator
can trace **idea → project → repository → feature → run → branch → pull request** through the same
Factory Core that does the engineering.

Every view in that chain renders a read model. This repository holds those read models.

## Status

Read models for every node of the trace, database readers for Factory Core run state and the packet
queue, and a read-only HTTP API over them.

## Read API

```bash
pnpm serve                                   # ~/factory-runs and ~/factory-runs/queue.sqlite, port 4180
pnpm serve --runs-root DIR --queue FILE --port N
```

It binds to `127.0.0.1` only and opens every database read-only, per request.

| Route | Returns |
| --- | --- |
| `GET /runs?state=&limit=` | `RunList`: total, counts by state, summaries newest first |
| `GET /runs/:run_id` | the run's summary and its trace (repository → feature → run → branch → PR) |
| `GET /queue` | total, counts by status, and queue entries; local paths are reduced to `run_dir` |

Malformed input gets 400, unknown routes 404, non-GET 405, and a failed read 500 without its message.

## Checks

Two checks are declared in `.factory/repo.yaml`, and both must pass:

| Check | Command |
| --- | --- |
| `typecheck` | `node_modules/.bin/tsc --noEmit` |
| `test` | `node_modules/.bin/vitest run --dir src --maxWorkers=1` |

They run with **network denied**, in an isolated worktree whose `node_modules` is symlinked from the
source checkout. Nothing can be installed during a run, so every dependency a packet needs must
already be committed here and installed in the checkout.

## Scope

`src/**` and `README.md` are the only writable paths. Workflows, the factory contract, and the
lockfile are denied. Pull requests are opened as drafts and are never auto-merged; merge is a human
decision.
