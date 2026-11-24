# US-DEMO-05 — Soft-delete rows as a recovery group in the example app

As application code in the example app, I want to soft-delete selected rows as one recovery group so that exactly the rows this call deleted can later be restored or purged together.

**Status:** Demo; source-reviewed in the example app service only, not runtime-tested here. The package does not ship group recovery; this is an application-owned recipe built on builder `softDelete()`.
**Access:** Application code holding a caller-owned transaction and a `tenantId` it has chosen and authorised; the service filters every query by that `tenantId`. Authorization and write serialisation are the caller's.
**Entry:** `deleteGroup(trx, { tenantId, ids, label })` in the example service.
**Documentation:** [Recipes](../../docs/recipes/index.md), [Builder lifecycle methods](../../docs/reference/README.md#builder-lifecycle-methods).
**Source:** [group_recovery.ts](../../examples/app/app/services/group_recovery.ts) (`deleteGroup`).
**Coverage:** [Group recovery tests](../../examples/app/tests/group_recovery.spec.ts), [example tests](../../examples/app/tests/group_recovery_example.spec.ts).

## Acceptance criteria

- `trx` is required; `input` requires numeric `tenantId`, numeric `ids` and string `label`, with no defaults. `deleteGroup` removes duplicate ids and rejects an empty id list before any write.
- It locks the tenant's active rows among the ids, creates a `usable` group, and calls `softDelete()` for each row. Only rows where `softDelete()` reports one update join the group, with their recorded `deletedAt`; a missing timestamp or row fails the operation. Any older association for that row is replaced.
- If no row was soft-deleted, it throws. It returns the new group id otherwise.
- It runs inside the caller's transaction and never rolls back itself; on a thrown error the caller must roll back to discard row and bookkeeping changes together.
- [US-DEMO-06](us-demo-06-restore-recovery-group.md) restores the group; [US-DEMO-13](us-demo-13-invalidate-recovery-group.md) invalidates it and [US-DEMO-07](us-demo-07-purge-recovery-group.md) purges selected rows.

## User flow

```mermaid
flowchart TD
    A["Supply tenant, selected row IDs and label"] --> B{"Any distinct IDs?"}
    B -->|No| C["Receive error"]
    B -->|Yes| D["Create group and try to delete active matches"] --> E{"Any rows captured and all operations succeeded?"}
    E -->|No| F["Receive error and roll back"]
    E -->|Yes| G["Receive group ID; commit or roll back"]
```

## Code flow

Scope: example service function through the builder `softDelete()` macro inside a caller transaction; transaction commit is caller-owned.

```mermaid
flowchart TD
    A["deleteGroup deduplicates ids"] --> B{"Any ids?"}
    B -->|No| C["Throw"]
    B -->|Yes| D["Lock tenant active candidates"] --> E["Insert usable group"] --> F{"Another candidate?"}
    F -->|Yes| G["softDelete by tenant and id"] --> H{"Affected count is one?"}
    H -->|No| F
    H -->|Yes| I["Read withTrashed by tenant and id"] --> J{"Timestamp present and trashed?"}
    J -->|No| C
    J -->|Yes| K["Replace old ownership, insert association, increment captured"] --> F
    F -->|No| L{"Captured any?"}
    L -->|No| C
    L -->|Yes| M["Return group id"]
```

**Code references:** [group_recovery.ts](../../examples/app/app/services/group_recovery.ts), [recipes](../../docs/recipes/index.md), [builder macros](../../src/bindings/model_query_builder.ts), [group recovery tests](../../examples/app/tests/group_recovery.spec.ts).
