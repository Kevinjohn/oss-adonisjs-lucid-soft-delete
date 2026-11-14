# US-DEMO-07 — Invalidate and purge a recovery group in the example app

As application code in the example app, I want to invalidate a recovery group and then permanently remove selected rows it still owns so that discarded rows are erased without touching rows a later group owns.

**Status:** Demo; source-reviewed in the example app service only, not runtime-tested here. The package does not ship group recovery; this is an application-owned recipe built on builder `onlyTrashed().forceDelete()`.
**Access:** Application code holding a caller-owned transaction and a `tenantId` it has chosen and authorised; the service filters every query by that `tenantId`. Authorization and write serialisation are the caller's.
**Entry:** `invalidateGroup(trx, { tenantId, groupId })`, then `purgeGroup(trx, { tenantId, groupId, ids })` in the example service. Invalidation disables restore and is the precondition for purge, so both share this story.
**Documentation:** [Recipes](../../docs/recipes/index.md), [Builder lifecycle methods](../../docs/reference/README.md#builder-lifecycle-methods).
**Source:** [group_recovery.ts](../../examples/app/app/services/group_recovery.ts) (`invalidateGroup` line 101, `purgeGroup` line 173).
**Coverage:** [Group recovery tests](../../examples/app/tests/group_recovery.spec.ts), [example tests](../../examples/app/tests/group_recovery_example.spec.ts).

## Acceptance criteria

- `invalidateGroup` changes a `usable` group to `invalidated` and keeps its associations; any other state throws.
- `purgeGroup` requires an `invalidated` group, at least one id, and that every selected id is currently associated with the group and trashed for the tenant. A mismatch throws before any deletion.
- It then runs `onlyTrashed().forceDelete()` on the selected ids, throws if fewer rows were removed than selected, deletes those associations and marks the group `consumed` once none remain. Unselected rows stay trashed and associated.
- Both functions run inside the caller's transaction and never roll back themselves; on a thrown error the caller must roll back to discard row and bookkeeping changes together.

## User flow

```mermaid
flowchart TD
    A["Application decides a recovery group will not be restored"] --> B["invalidateGroup"]
    B --> C{"Group was usable?"}
    C -->|No| D["Receive error"]
    C -->|Yes| E["Group can no longer be restored"]
    E --> F["purgeGroup with selected row ids"]
    F --> G{"Every id owned by the group and still deleted?"}
    G -->|No| H["Receive error; nothing is removed"]
    G -->|Yes| I["Selected rows are permanently removed"]
    I --> J{"Rows left in the group?"}
    J -->|Yes| K["Group stays invalidated for a later purge"]
    J -->|No| L["Group is consumed"]
```

## Code flow

Scope: example service functions through the builder `forceDelete()` macro inside a caller transaction; transaction commit is caller-owned.

```mermaid
flowchart TD
    A["invalidateGroup"] --> B["Update recovery_groups usable to invalidated"]
    B -->|Not 1 row| C["Throw"]
    D["purgeGroup"] --> E["Lock group; require invalidated"]
    E --> F["Require ids; lock recovery_records for group and ids"]
    F --> G["Lock onlyTrashed rows for tenant and ids"]
    G --> H{"All counts match ids?"}
    H -->|No| I["Throw before deletion"]
    H -->|Yes| J["onlyTrashed whereIn ids forceDelete"]
    J --> K{"Removed count matches?"}
    K -->|No| L["Throw; caller rolls back"]
    K -->|Yes| M["Delete those recovery_records"]
    M --> N{"Associations remain?"}
    N -->|No| O["Update group to consumed"]
    N -->|Yes| P["Return"]
```

**Code references:** [group_recovery.ts](../../examples/app/app/services/group_recovery.ts), [recipes](../../docs/recipes/index.md), [builder macros](../../src/bindings/model_query_builder.ts), [group recovery tests](../../examples/app/tests/group_recovery.spec.ts).
