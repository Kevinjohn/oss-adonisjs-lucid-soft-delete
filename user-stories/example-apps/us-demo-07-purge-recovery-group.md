# US-DEMO-07 — Invalidate and purge a recovery group in the example app

As application code in the example app, I want to invalidate a recovery group and then permanently remove selected rows it still owns so that discarded rows are erased without touching rows a later group owns.

**Status:** Demo; source-reviewed in the example app service only, not runtime-tested here. The package does not ship group recovery; this is an application-owned recipe built on builder `onlyTrashed().forceDelete()`.
**Access:** Application code holding a caller-owned transaction and a `tenantId` it has chosen and authorised; the service filters every query by that `tenantId`. Authorization and write serialisation are the caller's.
**Entry:** `invalidateGroup(trx, { tenantId, groupId })`, then `purgeGroup(trx, { tenantId, groupId, ids })` in the example service. Invalidation disables restore and is the precondition for purge, so both share this story.
**Documentation:** [Recipes](../../docs/recipes/index.md), [Builder lifecycle methods](../../docs/reference/README.md#builder-lifecycle-methods).
**Source:** [group_recovery.ts](../../examples/app/app/services/group_recovery.ts) (`invalidateGroup`, `purgeGroup`).
**Coverage:** [Group recovery tests](../../examples/app/tests/group_recovery.spec.ts), [example tests](../../examples/app/tests/group_recovery_example.spec.ts).

## Acceptance criteria

- `invalidateGroup` changes a `usable` group to `invalidated` and keeps its associations; any other state throws.
- `purgeGroup` requires an `invalidated` group, at least one distinct id (duplicates are removed), and that every selected id is currently associated with the group and trashed for the tenant. A mismatch throws before any deletion.
- It then runs `onlyTrashed().forceDelete()` on the selected ids, throws if fewer rows were removed than selected, deletes those associations and marks the group `consumed` once none remain, requiring one affected group row. It returns the removed count. Unselected rows stay trashed and associated.
- Both functions run inside the caller's transaction and never roll back themselves; on a thrown error the caller must roll back to discard row and bookkeeping changes together.

## User flow

```mermaid
flowchart TD
    A["Decide not to restore group"] --> B{"Invalidation succeeds?"}
    B -->|No| C["Receive error; roll back"]
    B -->|Yes| D["Group invalidated"] --> E["Request purge of selected IDs"] --> F{"Group invalidated and all IDs owned and trashed?"}
    F -->|No| C
    F -->|Yes| G{"Purge succeeds?"}
    G -->|No| C
    G -->|Yes| H{"Any associations remain?"}
    H -->|Yes| I["Commit partial purge; group stays invalidated"]
    H -->|No| J["Commit complete purge; group consumed"]
```

## Code flow

Scope: example service functions through the builder `forceDelete()` macro inside a caller transaction; transaction commit is caller-owned.

```mermaid
flowchart TD
    A["invalidateGroup updates usable tenant group"] --> B{"One affected?"}
    B -->|No| C["Throw"]
    B -->|Yes| D["Return; caller may then purge"]
    E["purgeGroup locks tenant group"] --> F{"Invalidated?"}
    F -->|No| C
    F -->|Yes| G["Deduplicate ids"] --> H{"Any ids?"}
    H -->|No| C
    H -->|Yes| I["Lock selected ownership records"] --> J{"Counts match?"}
    J -->|No| C
    J -->|Yes| K["Lock tenant onlyTrashed rows"] --> L{"Counts match?"}
    L -->|No| C
    L -->|Yes| M["onlyTrashed forceDelete tenant and ids"] --> N{"Affected count matches?"}
    N -->|No| C
    N -->|Yes| O["Delete those associations and count remaining"] --> P{"Any left?"}
    P -->|Yes| Q["Return affected count"]
    P -->|No| R["Update invalidated group to consumed; require one affected"] --> Q
```

**Code references:** [group_recovery.ts](../../examples/app/app/services/group_recovery.ts), [recipes](../../docs/recipes/index.md), [builder macros](../../src/bindings/model_query_builder.ts), [group recovery tests](../../examples/app/tests/group_recovery.spec.ts).
