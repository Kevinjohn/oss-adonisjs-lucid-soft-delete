# US-APP-11 — Commit lifecycle changes with application bookkeeping

As an application service, I want to bind writes to one transaction so a failed request can roll back all changes.

**Status:** Current, source-reviewed.
**Access:** An application service.
**Entry:** Attach the transaction to the instance or fetch through its client.
**Documentation:** [Package reference](../../docs/reference/README.md).
**Source:** [src/mixin.ts](../../src/mixin.ts).
**Coverage:** [tests/transactions.spec.ts](../../tests/transactions.spec.ts), [tests/uniqueness.spec.ts](../../tests/uniqueness.spec.ts).

## Acceptance criteria

- Instance delete, quiet delete, restore and physical deletion honour the attached transaction. Include application bookkeeping on the same client.
- The caller decides when to commit. A post-write hook error can still leave changes pending in the transaction. Commit persists the database changes. Rollback undoes them but does not rewind a retained instance. For a soft delete or restore, discard or [refresh the retained instance](us-app-13-refresh-instance.md). After a force-delete rollback, fetch a new instance because Lucid still marks the retained one deleted.

## User flow

```mermaid
flowchart TD
    A["Begin transaction"] --> B["Change record and bookkeeping"] --> C{"Succeeded?"}
    C -->|No| D["Roll back; discard or reload instance"]
    C -->|Yes| E["Commit or roll back according to application rules"]
```

## Code flow

```mermaid
flowchart TD
    A["Attach transaction client or fetch model through it"] --> B["delete, deleteQuietly, restore or forceDelete uses model client; caller writes bookkeeping"]
    B -->|Failure| E["Caller rolls back"]
    B -->|Success| C{"Caller commits?"}
    C -->|No| E
    C -->|Yes| D["Fetch durable state"]
    E --> F{"Retained instance marked physically deleted?"}
    F -->|Yes| G["Discard instance and fetch another"] --> D
    F -->|No| H["Discard or refresh retained instance"] --> D
```

**Code references:** [src/mixin.ts](../../src/mixin.ts).
