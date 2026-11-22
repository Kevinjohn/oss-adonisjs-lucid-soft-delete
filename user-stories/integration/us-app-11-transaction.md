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
- Commit persists the database changes. Rollback undoes them but does not rewind a retained instance. Discard or reload it before reading the durable state.

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
    A["Attach transaction client or fetch through it"] --> B["Perform lifecycle write and bookkeeping"]
    B -->|Failure| E["Caller rolls back"]
    B -->|Success| C{"Caller commits?"}
    C -->|No| E
    C -->|Yes| D["Fetch durable state"]
    E --> F["Discard or reload retained instance"] --> D
```

**Code references:** [src/mixin.ts](../../src/mixin.ts).
