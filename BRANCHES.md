# Branches

This document describes DYNAMIC's current branches, what each branch contains, and the branching convention to use for future work. Branch state changes over time; the inventory below was verified on 2026-07-22.

## Current Branch Shape

The current history is linear rather than divergent:

```text
origin/main (0c42efa)
  └── vg-work/fix-codebase-concerns (99abf5d)
        └── main (f6f4607)
              └── vg-work/clean-event-boundary (current working branch)
```

Each branch shown above contains the history of the branch to its left. There are no separate release, development, or hotfix branches at present.

## Branch Inventory

| Branch | Role | High-level contents | Relationship |
| --- | --- | --- | --- |
| `origin/main` | Published remote baseline | Initial monorepo; Expo, API, and admin foundations; offline sync; protocol form checksums; integration tests; admin corrections; local Nginx development edge; and Expo login/sync fixes. | Remote currently ends at `0c42efa`. Local `main` is 21 commits ahead. |
| `main` | Local integration branch | Everything in `origin/main`, followed by household/member sync, Expo routing, the shared event-core foundation, HHQ and pregnancy event processing, projection replay, canonical architecture/policy documentation, and codebase remediation. | Ends at `f6f4607`. Contains `vg-work/fix-codebase-concerns` and is not currently checked out. |
| `vg-work/fix-codebase-concerns` | Completed remediation checkpoint | Architecture/policy consolidation, codebase mapping, and fixes for concerns identified during codebase review. | Ends at `99abf5d`; it is one commit behind local `main` and is fully contained in `main`. |
| `vg-work/clean-event-boundary` | Active feature/integration branch | Everything in local `main`, plus a shared field-event boundary, workflow-decision tracing, study-staff identity and access controls, device/session security fixes, Expo app locking, centralized birth and pregnancy task generation, the Expo workspace rename, task-worklist reconciliation, and this documentation checkpoint. | Current working branch; 21 commits ahead of local `main` after this documentation commit. |

Only `origin/main` currently exists as a remote-tracking branch. The two `vg-work/*` branches and the newer local `main` commits have not been published to a remote branch in this checkout.

## What the Branches Represent

### `origin/main`

`origin/main` is the last state published to the repository's `origin` remote. It is a historical baseline, not the newest local application state. It contains the initial full-stack and offline-sync foundation but does not contain the later event-core, replay, identity, or task-worklist work.

### `main`

Local `main` is the intended integration baseline for completed work. Its additional commits establish the current architectural direction:

- immutable finalized CRFs and typed study events;
- shared event/reducer/workflow rules;
- HHQ and pregnancy event ingestion;
- deterministic task generation and projection replay;
- the canonical documentation under `docs/architecture.md` and `docs/policies/`; and
- remediation of concerns found during architecture and codebase review.

Before using `main` as the published baseline, reconcile and push its 21 local-only commits to `origin/main` through the project's chosen review process.

### `vg-work/fix-codebase-concerns`

This branch is a retained checkpoint from the architecture and code-remediation work. It no longer contains changes unique from `main`; local `main` is its direct descendant. Keep it only if the checkpoint remains useful for comparison or audit history. New work should not branch from it.

### `vg-work/clean-event-boundary`

This is the active branch and the most complete committed application state. Its work deepens the shared event boundary and adds identity, access-control, security, shared workflow generation, and offline task-worklist reconciliation. It should be verified and reviewed before being integrated into `main`.

Uncommitted working-tree files are not part of this branch description until they are committed.

## Branching Convention

The repository currently uses the following practical model:

1. Treat `main` as the integration branch for reviewed, working changes.
2. Create scoped working branches from the latest intended `main` baseline.
3. Name Codex-created branches with the `vg-work/` prefix followed by a short purpose, for example `vg-work/sync-reconciliation`.
4. Keep commits focused and run the smallest relevant tests and rendered UI checks before integration.
5. Update `CHANGELOG.md` for notable behavior, architecture, security, operational, or developer-workflow changes.
6. Review the full branch diff against `main`, then merge through the repository's chosen review process.
7. Delete or archive completed feature branches after their commits are safely integrated and published.

Avoid building new work on a completed checkpoint branch that is already behind `main`. Also avoid treating local uncommitted changes as belonging to a branch until they have been intentionally reviewed and committed.

## Inspecting Branch State

Use these commands from the repository root:

```bash
git branch -vv
git branch -r
git log --graph --decorate --oneline --all
git rev-list --left-right --count origin/main...main
git status --short
```

When branch tips or relationships change, update the date, diagram, inventory, and commit counts in this file.
