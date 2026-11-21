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
- An unsaved instance is rejected with `E_MODEL_NOT_PERSISTED`. A trashed instance without a dirty `deletedAt` is skipped; a physically deleted instance or a force flag delegates to Lucid's physical-delete path, which can reject an already deleted instance.
- For a fetched projection without `deletedAt`, the mixin reads the mapped column by persisted primary key on the model write client. A stored timestamp skips the write, preserving the timestamp and unrelated dirty attributes. An active row follows the normal or quiet path.
- A write error propagates. `persistDeletedAt` restores the previous in-memory timestamp only when Lucid has not advanced `$original`; an after-save hook can fail after the write completed.

## User flow

```mermaid
flowchart TD
    A["Call delete or deleteQuietly"] --> B{"Persisted?"}
    B -->|No| C["Receive E_MODEL_NOT_PERSISTED"]
    B -->|Yes| D{"Deletion action?"}
    D -->|Already trashed and unchanged| E["Return without writing"]
    D -->|Physical| F["Delegate to Lucid physical deletion"]
    D -->|Soft| G["Write deletedAt; normal call runs hooks, quiet call does not"]
    G -->|Failure| H["Receive error; post-write hook may fail after persistence"]
    G -->|Success| I["Ordinary fetches omit row"]
```

## Code flow

Scope: instance call through Lucid save; application route and authorization are outside the package boundary.

```mermaid
flowchart TD
    A["Call delete or deleteQuietly"] --> B["resolveDeleteAction"] --> C{"Action?"}
    C -->|Not persisted| D["Throw E_MODEL_NOT_PERSISTED"]
    C -->|Physical| E["Delegate to matching Lucid delete method"]
    C -->|Skip, including stored trashed projection| F["Return without write"]
    C -->|Soft| G{"Quiet?"}
    G -->|Yes| H["persistDeletedAt with skipHooks; saveQuietly"] --> I["Return or propagate error"]
    G -->|No| J["super.delete runs beforeDelete then overridden delete query"] --> K["persistDeletedAt; save with update/save hooks"] --> L["afterDelete"] --> M["finally resets isDeleted"] --> I
    J -->|Failure| M
    K -->|Failure| M
```

**Code references:** [resolveDeleteAction, persistDeletedAt and instance methods](../../src/mixin.ts), `@adonisjs/lucid` 22.4.2 `BaseModel.delete` (before:delete, adapter delete, after:delete), [lifecycle tests](../../tests/lifecycle.spec.ts), [instance API contract](../../docs/reference/README.md#delete).
