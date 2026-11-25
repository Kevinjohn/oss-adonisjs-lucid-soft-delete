# US-APP-04 — Permanently remove an active or trashed model

As application code using a `withSoftDeletes` model, I want to permanently delete one selected active or trashed model so that its row is physically removed when application policy requires it.

**Status:** Current; source-reviewed behavior, not runtime-tested here.
**Access:** Application code; application authorization, confirmation and retention policy are host-owned.
**Entry:** Call `forceDelete()` on a persisted active or trashed model instance.
**Documentation:** [Instance forceDelete contract](../../docs/reference/README.md#instance-forcedelete).
**Source:** [Model forceDelete and delete](../../src/mixin.ts).
**Coverage:** [Lifecycle tests](../../tests/lifecycle.spec.ts), [force-delete behavior](../../tests/model.spec.ts).

## Acceptance criteria

- `forceDelete()` stores the prior `$forceDelete` flag, sets it to `true`, calls `delete()`, then restores the prior flag in `finally` even when Lucid throws.
- The `resolveDeleteOperation()` decision uses the force flag to choose Lucid's physical-delete path for persisted active or trashed instances; the operation is not limited to trashed records.
- An unsaved instance is refused with `E_MODEL_NOT_PERSISTED` before `resolveDeleteOperation()` checks the force flag to select the physical path.
- The physical delete follows Lucid hooks and database constraints. The row is removed; related rows follow database rules, not automatic package cascades.
- A failed operation propagates. If an enclosing caller-owned transaction later rolls back, the database row returns but the retained model instance remains marked deleted; fetch a new instance.

## User flow

```mermaid
flowchart TD
    A["Application selects a model and applies its confirmation policy"] --> B["Call forceDelete()"]
    B --> P{"Is the model persisted?"}
    P -->|No| Q["Receive E_MODEL_NOT_PERSISTED"]
    P -->|Yes| C{"Physical delete succeeds?"}
    C -->|No| D["Receive Lucid or database failure"]
    C -->|Yes| E["Row is physically removed"]
    E --> F["A caller transaction may still roll back the database change"]
```

## Code flow

Scope: model method through Lucid physical delete and caller transaction boundary.

```mermaid
flowchart TD
    A["forceDelete saves previous flag; sets true"] --> B["Call delete and resolveDeleteOperation"] --> C{"Persisted?"}
    C -->|No| D["Throw E_MODEL_NOT_PERSISTED"] --> F["finally restores previous flag"]
    C -->|Yes| E["Delegate super.delete to Lucid physical query and hooks"] --> F
    F --> G{"Call succeeded?"}
    G -->|No| H["Propagate error; afterDelete can fail after write"]
    G -->|Yes| I{"Caller transaction rolls back later?"}
    I -->|Yes| J["Database row returns; retained instance remains deleted"]
    I -->|No| K["Row remains removed"]
```

**Code references:** [forceDelete, resolveDeleteOperation and $getQueryFor](../../src/mixin.ts), [instance API contract](../../docs/reference/README.md#instance-forcedelete), [lifecycle tests](../../tests/lifecycle.spec.ts).
