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
- `delete()` runs Lucid's `beforeDelete` and `afterDelete` hooks around the soft-delete write, and the write itself runs the `beforeUpdate`, `beforeSave`, `afterUpdate` and `afterSave` hooks; `deleteQuietly()` runs none. After the call, the row remains stored, `deletedAt` is set, and the instance's `$isDeleted` is reset in `finally`.
- An unsaved instance is rejected with `E_MODEL_NOT_PERSISTED`. A trashed instance without a dirty `deletedAt` is skipped; a force-deleted instance follows Lucid's physical-delete path.
- A write error propagates. `persistDeletedAt` restores the previous in-memory timestamp only when Lucid has not advanced `$original`; an after-save hook can fail after the write completed.

## User flow

```mermaid
flowchart TD
    A["Application has a model to delete"] --> G{"Is the model persisted?"}
    G -->|No| H["Receive E_MODEL_NOT_PERSISTED"]
    G -->|Yes| I{"Already trashed with unchanged deletedAt?"}
    I -->|Yes| J["Return without saving"]
    I -->|No, active soft-delete path| B{"Call delete() or deleteQuietly()?"}
    B -->|delete| C["Lucid runs beforeDelete, update and save hooks, writes, then runs afterUpdate, afterSave and afterDelete"]
    B -->|deleteQuietly| D["Lucid saveQuietly runs"]
    C --> E["deletedAt is saved"]
    D --> E
    E --> F["Ordinary model fetches omit the row"]
```

## Code flow

Scope: instance call through Lucid save; application route and authorization are outside the package boundary.

```mermaid
flowchart TD
    A["ModelWithSoftDeletes.delete or deleteQuietly"] --> B["deleteActionFor"]
    B --> C{"Persisted state and action"}
    C -->|Unsaved| D["Throw E_MODEL_NOT_PERSISTED"]
    C -->|Already trashed and unchanged| E["Return without write"]
    C -->|Physical| F["Delegate to Lucid physical delete"]
    C -->|Soft| G{"Quiet method?"}
    G -->|No| H["super.delete runs before:delete, then the overridden $getQueryFor delete action"]
    H --> I["persistDeletedAt with DateTime.local()"]
    G -->|Yes| J["persistDeletedAt with quietly = true"]
    I --> K["model.save runs update and save hooks, then after:delete runs"]
    J --> L["model.saveQuietly omits hooks"]
    K --> M["delete finally resets $isDeleted, including on failure"]
    L --> N["Return, or propagate persistence error"]
```

**Code references:** [deleteActionFor, persistDeletedAt and instance methods](../../src/mixin.ts), [Lucid BaseModel.delete (before:delete, adapter delete, after:delete)](../../node_modules/@adonisjs/lucid/build/src/orm/base_model/index.js), [lifecycle tests](../../tests/lifecycle.spec.ts), [instance API contract](../../docs/reference/README.md#delete).
