# US-APP-07 — Permanently remove matching rows in bulk

As application code, I want to permanently remove matching rows in bulk so that application retention policy can physically erase a selected set of rows.

**Status:** Current; source-reviewed API availability, not runtime-tested here.
**Access:** Application code using a `withSoftDeletes` model with the provider booted (or the builder extension installed directly); authorization and transaction lifecycle are caller-owned.
**Entry:** A Lucid model query builder followed by `forceDelete(options?)`.
**Documentation:** [Builder lifecycle reference](../../docs/reference/README.md#builder-lifecycle-methods).
**Source:** [extendModelQueryBuilder](../../src/bindings/model_query_builder.ts), [receipt implementation](../../src/receipts.ts).
**Coverage:** [Builder lifecycle tests](../../tests/builder_lifecycle.spec.ts), [builder restore tests (row-window refusals)](../../tests/builder_restore.spec.ts), [receipt tests](../../tests/builder_receipts.spec.ts).

## Acceptance criteria

- The caller selects rows with ordinary Lucid predicates and optionally supplies `{ receipt: true }`; omitted/false returns a count. Unknown option keys or a non-boolean receipt flag reject.
- In `onlyTrashed()` mode it retains the non-null deletion predicate; otherwise it groups caller predicates and can delete active or trashed matches. This is irreversible at the package layer.
- The model must use `withSoftDeletes` and have a mapped `deletedAt` column. Many-to-many and has-many-through relation builders reject before writing; query the related model by selected IDs instead.
- Application authorization, tenant predicates and cascade policy are host-owned. Builder writes do not hydrate instances, run model hooks, update `updatedAt` or invoke custom column `prepare` functions.
- Default output is an affected-row count. `{ receipt: true }` instead returns changed primary-key `ids` and `count`; it requires an explicit caller-owned transaction on a supported dialect, a supported query shape and no row window. PostgreSQL uses `RETURNING`; MySQL and SQLite select affected IDs first and compare counts. A divergence raises `E_BULK_RECEIPT_DIVERGED`; roll back the transaction. A receipt describes an uncommitted mutation, not an audit log.
- Without receipts, `limit`, `offset` and relation `groupLimit` are refused; the narrow exception is a limit of one on a single-parent belongs-to query targeting the related primary key on its own unqualified table. If Lucid already applied the relation constraints, the required key equality must still hold. The permitted limit is cleared before the physical delete. A has-one limit or a widened previewed belongs-to query is refused. Database errors propagate. The caller owns commit or rollback.
- Builder `delete()` and `del()` physically delete; they do not provide recoverable deletion or the lifecycle methods' selection guarantees. A builder already run can retain its earlier read filter, so start a fresh query for a bulk write.

## User flow

```mermaid
flowchart TD
    A["Application selects rows and applies its access policy"] --> B["Call forceDelete with optional receipt"]
    B --> C{"Supported model, query shape and transaction if receipt requested?"}
    C -->|No| D["Receive specific validation error before writing"]
    C -->|Yes| E["Permanently remove matching rows in bulk"]
    E --> F{"Database write succeeds?"}
    F -->|No| G["Receive failure; roll back any caller transaction"]
    F -->|Yes| H["Receive count or receipt; finish any caller transaction"]
```

## Code flow

Scope: provider-installed builder macro through Lucid execution; route authorization and outer transaction ownership remain with the host.

```mermaid
flowchart TD
    A["Call forceDelete macro"] --> B["Validate options and model; reject unsupported relations"] --> C{"Receipt requested?"}
    C -->|Yes| D["assertReceiptSupported"] --> F{"onlyTrashed mode?"}
    C -->|No| E["assertSupportedRowWindow; clear allowed belongs-to limit"] --> F
    B -->|Invalid| X["Throw before mutation"]
    D -->|Invalid| X
    E -->|Invalid| X
    F -->|Yes| G["Add qualified not-null predicate"] --> I{"Receipt requested?"}
    F -->|No| H["Group caller predicates"] --> I
    I -->|No| J["Physical delete and countAffectedRows"]
    I -->|Yes| K["executeWithReceipt deletes with dialect-specific path"] --> L["Return count and ids"]
    J -->|Failure| Y["Propagate error"]
    K -->|Failure| Y
```

**Code references:** [Macro and validation](../../src/bindings/model_query_builder.ts), [executeWithReceipt and option parsing](../../src/receipts.ts), [receipt contract](../../docs/reference/README.md#receipts), [lifecycle tests](../../tests/builder_lifecycle.spec.ts).
