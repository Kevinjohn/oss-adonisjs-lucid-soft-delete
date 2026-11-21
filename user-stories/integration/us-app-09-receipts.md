# US-APP-09 — Record the rows a bulk lifecycle write changed

As an application service, I want to collect changed primary keys so bookkeeping can commit with the mutation.

**Status:** Current, source-reviewed.
**Access:** An application service.
**Entry:** Pass `{ receipt: true }` to a bulk lifecycle method in a caller-owned transaction.
**Documentation:** [Package reference](../../docs/reference/README.md).
**Source:** [src/bindings/model_query_builder.ts](../../src/bindings/model_query_builder.ts), [src/receipts.ts](../../src/receipts.ts).
**Coverage:** [tests/builder_receipts.spec.ts](../../tests/builder_receipts.spec.ts), [tests/receipt_lock_wait.spec.ts](../../tests/receipt_lock_wait.spec.ts).

## Acceptance criteria

- Soft-delete, restore and force-delete receipts contain count and unordered distinct ids. Only soft-delete adds deletedAt, null for zero changes.
- Omitting receipt or using false returns the ordinary count. Receipt mode requires a transaction and a supported query shape, including eligible has-many builders. Unsupported shapes are refused before mutation.
- PostgreSQL uses `RETURNING` rather than preselecting IDs. MySQL selects and locks IDs; SQLite selects IDs without a row lock. Both constrain the write to selected IDs and reject a count mismatch with `E_BULK_RECEIPT_DIVERGED`. Database failures propagate. A receipt only describes a durable write after commit.

## User flow

```mermaid
flowchart TD
    A["Begin transaction and select rows"] --> B["Request receipt"] --> C{"Mutation succeeds?"}
    C -->|No| D["Roll back"]
    C -->|Yes| E["Record changed keys"] --> F["Commit together or roll back"]
```

## Code flow

```mermaid
flowchart TD
    A["Validate options, model, dialect, transaction and query shape"] --> B{"Valid?"}
    B -->|No| C["Throw before mutation"]
    B -->|Yes| D{"softDelete in onlyTrashed mode?"}
    D -->|Yes| E["Return empty receipt"]
    D -->|No| F["Apply lifecycle selection"] --> G{"Dialect?"}
    G -->|PostgreSQL| H["Clone and execute write returning primary keys"] --> I["Return receipt"]
    G -->|MySQL or SQLite| J["Clone and select ids; MySQL locks"] --> K{"Any ids?"}
    K -->|No| E
    K -->|Yes| L["Clone and constrain write to selected ids"] --> M{"Affected count matches?"}
    M -->|No| N["Throw E_BULK_RECEIPT_DIVERGED"]
    M -->|Yes| I
    H -->|Failure| O["Propagate database error"]
    J -->|Failure| O
    L -->|Failure| O
```

**Code references:** [src/bindings/model_query_builder.ts](../../src/bindings/model_query_builder.ts), [src/receipts.ts](../../src/receipts.ts).
