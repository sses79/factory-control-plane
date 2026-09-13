# Factory Control Plane

Phase 8 of the autonomous engineering software factory. The goal of this phase is that one operator
can trace **idea → project → repository → feature → run → branch → pull request** through the same
Factory Core that does the engineering.

Every view in that chain renders a read model. This repository holds those read models.

## Status

Seeded, with no read model yet. The scaffolding exists so that the declared checks have something to
run: Factory Core cannot bootstrap an empty repository, because a feature packet only reaches a draft
pull request if its declared checks pass.

`src/placeholder.ts` is a placeholder and is expected to be replaced by the first real packet.

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
