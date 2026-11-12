# US-APP-01 — Soft-delete a model instance

As application code using a `SoftDeletes` model, I want to delete a persisted instance so that it disappears from ordinary model queries while remaining recoverable.

**Status:** Current; source-reviewed behavior, not runtime-tested here.
**Access:** Application code. Application authorization is not provided by this package.
**Entry:** Instance `delete()` or `deleteQuietly()`.
**Documentation:** [Instance lifecycle methods](../../docs/reference/README.md#instance-lifecycle-methods).
**Source:** [SoftDeletes mixin](../../src/mixin.ts).
**Coverage:** [Model lifecycle tests](../../tests/model.spec.ts), [quiet deletion tests](../../tests/lifecycle.spec.ts).

## Acceptance criteria

- On a persisted, active instance, `delete()` and `deleteQuietly()` set `deletedAt` to the current local `DateTime`; the former uses Lucid `save()`, the latter `saveQuietly()`.
- `delete()` follows model save hooks; after the call, the row remains stored, `deletedAt` is set, and the instance's `$isDeleted` is reset in `finally`.
- An unsaved instance is rejected with `E_MODEL_NOT_PERSISTED`. A trashed instance without a dirty `deletedAt` is skipped; a force-deleted instance follows Lucid's physical-delete path.
- A write error propagates. `persistDeletedAt` restores the previous in-memory timestamp only when Lucid has not advanced `$original`; an after-save hook can fail after the write completed.

## User flow

```mermaid
flowchart TD
    A["Application has a persisted model"] --> B{"Call delete() or deleteQuietly()?"}
    B -->|delete| C["Lucid save hooks run"]
    B -->|deleteQuietly| D["Lucid saveQuietly runs"]
    C --> E["deletedAt is saved"]
    D --> E
    E --> F["Ordinary model fetches omit the row"]
    A --> G{"Is the model persisted?"}
    G -->|No| H["Receive E_MODEL_NOT_PERSISTED"]
```

## Code flow

Scope: instance call through Lucid save; application route and authorization are outside the package boundary.

```mermaid
flowchart TD
    A["ModelWithSoftDeletes.delete or deleteQuietly"] --> B["deleteActionFor"]
    B --> C{"Action"}
    C -->|Unsaved| D["Throw E_MODEL_NOT_PERSISTED"]
    C -->|Already trashed and unchanged| E["Return without write"]
    C -->|Active or changed| F["super.delete or super.deleteQuietly"]
    F --> G["$getQueryFor returns soft-delete callbacks"]
    G --> H["persistDeletedAt(DateTime.local())"]
    H --> I{"Quietly?"}
    I -->|No| J["model.save()"]
    I -->|Yes| K["model.saveQuietly()"]
    J --> L["delete finally resets $isDeleted"]
    K --> M["Timestamp remains persisted"]
```

**Code references:** [deleteActionFor, persistDeletedAt and instance methods](../../src/mixin.ts), [lifecycle tests](../../tests/lifecycle.spec.ts), [instance API contract](../../docs/reference/README.md#delete).
