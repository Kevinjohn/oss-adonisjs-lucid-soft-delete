# US-APP-06 — Restore matching rows in bulk

As application code, I want to restore matching rows in bulk so that matching deleted rows become visible to ordinary model queries again.

**Status:** Current; source-reviewed API availability, not runtime-tested here.
**Access:** Application code using a `SoftDeletes` model; authorization and transaction lifecycle are caller-owned.
**Entry:** A Lucid model query builder followed by `restore(options?)`.
**Documentation:** [Builder lifecycle reference](../../docs/reference/README.md#builder-lifecycle-methods).
**Source:** [extendModelQueryBuilder](../../src/bindings/model_query_builder.ts), [receipt implementation](../../src/receipts.ts).
**Coverage:** [Builder lifecycle tests](../../tests/builder_lifecycle.spec.ts), [builder restore tests](../../tests/builder_restore.spec.ts), [receipt tests](../../tests/builder_receipts.spec.ts).

## Acceptance criteria

- The caller selects rows with ordinary Lucid predicates and optionally supplies `{ receipt: true }`; omitted/false returns a count. Unknown option keys or a non-boolean receipt flag reject.
- The macro restricts to non-null deletion timestamps and clears them. Active rows are unaffected; uniqueness conflicts propagate for the host to resolve.
- The model must use `SoftDeletes` and have a mapped `deletedAt` column. Many-to-many and has-many-through relation builders reject before writing; query the related model by selected IDs instead.
- Application authorization, tenant predicates and cascade policy are host-owned. Builder writes do not hydrate instances, run model hooks, update `updatedAt` or invoke custom column `prepare` functions.
- Default output is an affected-row count. `{ receipt: true }` instead returns changed primary-key `ids` and `count`; it requires an explicit caller-owned transaction on a supported dialect, a supported query shape and no row window. PostgreSQL uses `RETURNING`; MySQL and SQLite select affected IDs first and compare counts. A divergence raises `E_BULK_RECEIPT_DIVERGED`; roll back the transaction. A receipt describes an uncommitted mutation, not an audit log.
- Without receipts, `limit`, `offset` and relation `groupLimit` are refused; the narrow exception is a limit of one on a single-parent belongs-to query targeting the related primary key on its own unqualified table. If Lucid already applied the relation constraints, the required key equality must still hold. A has-one limit or a widened previewed belongs-to query is refused. Database errors propagate. The caller owns commit or rollback.
- Builder `delete()` and `del()` physically delete regardless of read mode; they do not provide recoverable deletion or the lifecycle methods' selection guarantees.

## User flow

```mermaid
flowchart TD
    A["Application selects rows and applies its access policy"] --> B["Call restore with optional receipt"]
    B --> C{"Supported model, query shape and transaction if receipt requested?"}
    C -->|No| D["Receive specific validation error before writing"]
    C -->|Yes| E["Apply restore matching rows in bulk"]
    E --> F{"Database write succeeds?"}
    F -->|No| G["Receive failure; roll back any caller transaction"]
    F -->|Yes| H["Receive count or receipt; finish any caller transaction"]
```

## Code flow

Scope: provider-installed builder macro through Lucid execution; route authorization and outer transaction ownership remain with the host.

```mermaid
flowchart TD
    A["Call restore macro"] --> B["Validate options and model; reject unsupported relations"] --> C{"Receipt requested?"}
    C -->|Yes| D["assertReceiptSupported"] --> F["Add qualified not-null predicate"]
    C -->|No| E["assertSupportedRowWindow"] --> F
    B -->|Invalid| X["Throw before mutation"]
    D -->|Invalid| X
    E -->|Invalid| X
    F --> I{"Receipt requested?"}
    I -->|No| J["Update timestamp to null and countAffectedRows"]
    I -->|Yes| K["executeWithReceipt updates with dialect-specific path"] --> L["Return count and ids"]
    J -->|Failure| Y["Propagate error"]
    K -->|Failure| Y
```

**Code references:** [Macro and validation](../../src/bindings/model_query_builder.ts), [executeWithReceipt and option parsing](../../src/receipts.ts), [receipt contract](../../docs/reference/README.md#receipts), [lifecycle tests](../../tests/builder_lifecycle.spec.ts).
