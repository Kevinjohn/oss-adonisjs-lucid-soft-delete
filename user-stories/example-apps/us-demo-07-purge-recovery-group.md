# US-DEMO-07 — Purge selected rows from an invalidated recovery group in the example app

As application code in the example app, I want to permanently remove selected rows an invalidated recovery group still owns so that discarded rows are erased without touching rows a later group owns.

**Status:** Demo; source-reviewed in the example app service only, not runtime-tested here. The package does not ship group recovery; this is an application-owned recipe built on builder `onlyTrashed().forceDelete()`.
**Access:** Application code holding a caller-owned transaction and a `tenantId` it has chosen and authorised; the service filters every query by that `tenantId`. Authorization and write serialisation are the caller's.
**Entry:** `purgeGroup(trx, { tenantId, groupId, ids })` in the example service, after [invalidation](us-demo-13-invalidate-recovery-group.md).
**Documentation:** [Recipes](../../docs/recipes/index.md), [Builder lifecycle methods](../../docs/reference/README.md#builder-lifecycle-methods).
**Source:** [group_recovery.ts](../../examples/app/app/services/group_recovery.ts) (`purgeGroup`).
**Coverage:** [Group recovery tests](../../examples/app/tests/group_recovery.spec.ts), [example tests](../../examples/app/tests/group_recovery_example.spec.ts).

## Acceptance criteria

- `trx` and `input` with numeric `tenantId`, string `groupId` and numeric `ids` are required; there are no defaults. All writers must follow the per-tenant and ID serialisation protocol.
- `purgeGroup` requires an `invalidated` group, at least one distinct id (duplicates are removed), and that every selected id is currently associated with the group and trashed for the tenant. A mismatch throws before any deletion.
- It then runs `onlyTrashed().forceDelete()` on the selected ids, throws if the removed count differs from the selected count, deletes those associations and marks the group `consumed` once none remain, requiring one affected group row. It returns the removed count. Unselected rows stay trashed and associated.
- The function runs inside the caller's transaction and does not roll itself back; on a thrown error the caller must roll back to discard row and bookkeeping changes together.

## User flow

```mermaid
flowchart TD
    E["Request purge of selected IDs from an invalidated group"] --> F{"Group invalidated and all IDs owned and trashed?"}
    F -->|No| C["Receive error; roll back"]
    F -->|Yes| G{"Purge succeeds?"}
    G -->|No| C
    G -->|Yes| H{"Any associations remain?"}
    H -->|Yes| I["Return count; commit or roll back partial purge"]
    H -->|No| J["Return count; commit or roll back consumed group"]
```

## Code flow

Scope: example service function through the builder `forceDelete()` macro inside a caller transaction; transaction commit is caller-owned.

```mermaid
flowchart TD
    E["purgeGroup locks tenant group"] --> F{"Invalidated?"}
    F -->|No| C["Throw"]
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
