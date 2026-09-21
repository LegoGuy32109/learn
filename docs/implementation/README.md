# Swarm implementation plan

This directory defines the next multi-agent implementation stage. It starts
from the verified Turso/API baseline and is designed for several agents working
for multiple hours without editing the same files.

## Baseline gate

The coordinator must begin from one committed revision for which all commands
pass:

```bash
deno task check
deno task test
deno task test:db
deno task e2e
```

The baseline includes `learn-local` and `learn-dev`. It does not include a
production database. `migrations/001_initial.sql` is immutable.

Before starting parallel work, each agent reads:

1. `AGENTS.md`
2. `CONTEXT.md`
3. `docs/architecture.md`
4. `docs/domain-model.md`
5. `docs/api-v1.md`
6. `docs/turso-databases.md`
7. Its assigned workstream document

## Worktree and ownership rules

Give each implementation agent its own Git worktree from the same baseline.
Each agent commits only its assigned work and reports the commit SHA,
verification output, and contract changes to the coordinator.

Agents must not:

- edit `001_initial.sql`;
- print or copy ignored environment files;
- create `learn-prod`;
- run destructive database commands;
- add a publish API or validation bypass;
- change another workstream's owned files without coordinator approval; or
- claim completion from unit tests alone when its workstream requires a real
  Turso or browser smoke.

The coordinator owns cross-workstream wiring in `src/app.ts`, `main.ts`,
`deno.json`, and `deno.lock`. Workstream agents should expose route modules,
repositories, and functions that the coordinator can wire with small changes.

## Parallel workstreams

| Workstream | Can start | Primary output |
| --- | --- | --- |
| [A: Authoring contract](authoring-contract.md) | Immediately | Complete schema, OpenAPI, resolver diagnostics, generated validator |
| [B: Server progress sync](server-progress-sync.md) | Immediately | Migration 002, event ingestion/pull, canonical checkpoint projection |
| [C: Client sync](client-progress-sync.md) | Immediately against fixtures | IndexedDB outbox, pull/merge, sync status, multi-device tests |
| [D: API-token operations](token-operations.md) | Immediately | Mint/list/revoke workflow and security tests |

Workstream C integrates after B publishes its fixtures and route contract.
Workstream A should merge before public agent/plugin work begins. Workstream D
can merge independently before B.

## Merge order

1. Authoring contract
2. API-token operations
3. Server progress sync
4. Client sync
5. Coordinator wiring and full regression pass

If two workstreams need the same shared contract, merge the contract-only
commit first. Do not resolve concurrent implementations by choosing whichever
branch merged first.

## Coordinator completion gate

The stage is complete only when:

- all four workstream acceptance gates pass;
- a real `learn-test-<uuid>` database is created and deleted by the integration
  harness;
- two isolated browser contexts merge progress without duplication;
- a stale navigation checkpoint cannot replace a checkpoint based on a more
  advanced learning-event frontier;
- resolver, downloadable validator, JSON Schema, and OpenAPI fixtures agree;
- secrets are absent from Git history and test output; and
- the complete command suite passes from a clean checkout.

