# API reference

This reference documents the public API of `0.1.0-alpha`. Check the README for the supported runtime and dependency versions, installation steps, and the exact-version guidance.

## Contents

- [SoftDeletes composition](#softdeletes-composition)
- [Model state](#model-state)
  - [`deletedAt`](#deletedat)
  - [`trashed`](#trashed)
  - [`$forceDelete` flag](#forcedelete-flag)
- [Read modes](#read-modes)
- [Instance lifecycle methods](#instance-lifecycle-methods)
  - [`delete()`](#delete)
  - [`deleteQuietly()`](#deletequietly)
  - [`restore()`](#restore)
  - [`forceDelete()`](#instance-forcedelete)
- [Builder lifecycle methods](#builder-lifecycle-methods)
  - [`softDelete()`](#softdelete)
  - [`restore()`](#builder-restore)
  - [`forceDelete()`](#builder-forcedelete)
  - [Receipts](#receipts)
  - [`delete()` and `del()`](#delete-and-del)
- [Scope boundaries and query behavior](#scope-boundaries-and-query-behavior)
- [Relationship aggregates and existence queries](#relationship-aggregates-and-existence-queries)
- [Exports, guards, and TypeScript](#exports-guards-and-typescript)
- [Errors](#errors)

## SoftDeletes composition

Use Node.js 24 or newer, AdonisJS core 7, Lucid 22, Luxon 3.4.4 or newer within 3.x, and TypeScript 5.9 or newer. Install the provider through the configure command or register it in `adonisrc.ts`. Create a nullable timestamp column for every table whose model uses the mixin. See the [README](../README.md#install) for installation and migration setup, or the [tutorial](tutorial.md) for a complete project example.

Compose `SoftDeletes` with `BaseModel`:

```ts
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

export default class User extends compose(BaseModel, SoftDeletes) {
  static table = 'users'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string
}
```

This example assumes a configured provider and a `users.deleted_at` nullable timestamp. The mixin provides a `deletedAt` date-time column mapped to `deleted_at` by default. Override `columnName` when the database uses another name; see [model state](#model-state).

Unless stated otherwise, the examples below assume this `User` model is configured, `db` is the application's Lucid database service, `userId` identifies a persisted user, and `ids` is a caller-selected list of user IDs. Relation examples assume `User` has a `posts` relation. Each snippet shows the relevant call rather than repeating the application setup.

## Model state

### `deletedAt`

Optional `DateTime | null` instance property. `null` means active; a date-time means soft-deleted. A fetched projection that omitted this field has unknown state even though `trashed` reads as `false`.

When using a custom database column, map the mixin property rather than declaring a second property:

```ts
import type { DateTime } from 'luxon'
import { column } from '@adonisjs/lucid/orm'

// Inside the User class above.
@column.dateTime({ columnName: 'removed_at' })
declare deletedAt: DateTime | null
```

`serializeAs` controls only serialized output. The default serialized key is the model property name (`deletedAt`), even when `columnName` is `removed_at`. `trashed` is a computed getter and is not serialized as a column by default. A query projection that omits `deletedAt` must load it before `restore()`; see [restore](#restore).

Redeclaring the `deletedAt` decorator, for example to add the [UTC ISO serialiser](cookbook.md#map-a-custom-deletion-column-and-serialize-utc-iso), replaces the whole column definition, so the column name and serialized key fall back to the naming strategy defaults. Repeat any `columnName` or `serializeAs` option from the original declaration in the new decorator.

### `trashed`

Read-only getter. It returns whether the loaded `deletedAt` value is neither `null` nor `undefined`; it does not query the database. An omitted projection reads as `false` because the getter sees `undefined`, not because the row is known to be active.

### `$forceDelete` flag

Public boolean used by the instance deletion path. `forceDelete()` temporarily sets it and restores its prior value in `finally`, including on failure. Do not set it as a substitute for calling the method.

## Read modes

Read modes are selected on the root model query or on the individual relation query that needs them:

```ts
const activeUsers = await User.query()
const everyUser = await User.withTrashed().orderBy('id')
const recycleBin = await User.onlyTrashed().orderBy('id')
```

`User.query()` starts in the default mode and the fetch scope adds `deletedAt IS NULL`. Static `User.withTrashed()` and builder `.withTrashed()` include both active and trashed rows. Static `User.onlyTrashed()` and builder `.onlyTrashed()` select rows with a non-null deletion time. Static methods return a model query builder; builder methods return that builder for chaining. The provider must be booted for builder macros, and the model must use the mixin.

The root mode does not switch related preload or aggregate modes. Select a mode in each relation callback, such as `preload('posts', (query) => query.withTrashed())`. See the [scope contract](scope-contract.md#related-model-queries) for relationship boundaries, aliases, and query paths that bypass model hooks.

The public `SoftDeletesStatics` contract also exposes `ignoreDeleted(query)`, `ignoreDeletedPaginate([countQuery, query])`, and `disableIgnore(query)`. They are the mixin's Lucid hook/override interface. Application queries should normally select `withTrashed()` or `onlyTrashed()` rather than invoking hook methods directly.

## Instance lifecycle methods

Instance methods act on one model and use that instance's Lucid query client, including a named-connection client used to fetch it. Change the transaction with `useTransaction(trx)`. The package does not open a transaction. For a caller-owned transaction, fetch with `query({ client: trx })` or attach it with `useTransaction(trx)`; commit or roll back it yourself. A rollback does not rewind the in-memory model. See [transaction state](#caller-owned-transactions-and-model-state).

### `delete()`

Soft-deletes a persisted active instance by saving a local deletion timestamp. It also saves other dirty attributes on that write.

- **Eligible state:** Persisted, not physically deleted, active or trashed model; an unpersisted instance rejects with `E_MODEL_NOT_PERSISTED`. Lucid rejects a physically deleted instance through its immutable-model guard.
- **Return/no-op:** `Promise<void>`. If already trashed, not physically deleted, and `deletedAt` is unchanged, it skips the write and hooks; other dirty attributes remain dirty and are not saved by that no-op. If `deletedAt` is dirty on a persisted, non-deleted instance, it writes again with a new deletion timestamp.
- **Hooks:** On the soft-delete write, Lucid runs `beforeDelete` → `beforeUpdate` → `beforeSave` → database write → `afterUpdate` → `afterSave` → `afterDelete`. Hook and database errors propagate. An after-hook can fail after the write completed.
- **Dirty fields and timestamps:** Dirty fields are saved with the deletion timestamp. Configured automatic `updatedAt` advances. Lucid column `prepare` functions run.
- **Client:** Uses the instance's client; a caller transaction must be attached to the instance.

```ts
const user = await User.findOrFail(userId)
await user.delete()
```

Use `deleteQuietly()` when the same soft-delete save should omit hooks.

### `deleteQuietly()`

Takes the same active-to-trashed path as `delete()` using Lucid's quiet save methods.

- **Eligible state:** Persisted, not physically deleted, active or trashed model; an unpersisted instance rejects with `E_MODEL_NOT_PERSISTED`. Lucid rejects a physically deleted instance through its immutable-model guard.
- **Return/no-op:** `Promise<void>`. Repeating a delete on a trashed, non-deleted instance with unchanged `deletedAt` is a no-op; other dirty attributes remain unsaved on that no-op. If `deletedAt` is dirty on a persisted, non-deleted instance, it writes again with a new deletion timestamp.
- **Hooks:** No model hooks run. Errors from the persistence operation propagate.
- **Dirty fields and timestamps:** A soft-delete write saves other dirty fields and advances configured `updatedAt`; column `prepare` runs. The no-op writes nothing.
- **Client:** Uses the instance's client, including any caller transaction attached to it.

```ts
const user = await User.findOrFail(userId)
await user.deleteQuietly()
```

When `$forceDelete` is true, `deleteQuietly()` follows Lucid's physical quiet-delete path. Prefer the explicit `forceDelete()` API so the intent is clear.

### `restore()`

Clears `deletedAt` on a persisted trashed instance.

- **Eligible state:** Persisted and not physically deleted, with `deletedAt` loaded for fetched instances. Unpersisted models reject with `E_MODEL_NOT_PERSISTED`; force-deleted instances reject with `E_MODEL_FORCE_DELETED`; fetched projections without the deletion property reject with `E_MODEL_UNKNOWN_DELETION_STATE`.
- **Return/no-op:** `Promise<this>`. An active persisted model returns itself without a write. A trashed model clears the timestamp and returns itself.
- **Hooks:** The save uses Lucid's update/save hook order: `beforeUpdate` → `beforeSave` → database write → `afterUpdate` → `afterSave`. Errors propagate; an after-hook may fail after the write.
- **Dirty fields and timestamps:** A restore write also saves other dirty attributes, advances configured `updatedAt`, and uses column `prepare`. Active no-op restores do not save dirty fields.
- **Client:** Uses the instance's client and therefore honors an attached transaction.
- **Quiet behavior:** There is no quiet instance restore method; `restore()` uses normal Lucid save hooks.

```ts
const deleted = await User.onlyTrashed().where('id', userId).firstOrFail()
await deleted.restore()
```

For a projection that is still persisted and was not force-deleted, refresh it to load the full row, or refetch with `withTrashed()` and the required columns:

```ts
const partial = await User.onlyTrashed().select('id').where('id', userId).firstOrFail()
await partial.refresh()
await partial.restore()
```

Refresh cannot recover a physically deleted row. Resolve unique-value conflicts before retrying. In PostgreSQL, roll back a failed transaction before retrying in a new transaction.

### Instance `forceDelete()`

Physically deletes one persisted model through Lucid's instance delete path.

- **Eligible state:** Persisted active or trashed model; an unpersisted instance rejects with `E_MODEL_NOT_PERSISTED`. Database foreign-key constraints still apply.
- **Return/no-op:** `Promise<void>`. The row is removed on success; there is no successful no-op result for an already physically deleted record.
- **Hooks:** Runs `beforeDelete` → physical delete → `afterDelete`; it does not run update/save hooks. Hook and database errors propagate. An `afterDelete` error can follow a completed physical delete.
- **Dirty fields and timestamps:** Other dirty attributes are not saved. `updatedAt` is not advanced and column `prepare` does not run for a model update because no model update occurs.
- **Client:** Uses the instance's client, including an attached caller transaction.
- **Flag/error precedence:** It saves the prior `$forceDelete` value, sets it to `true`, calls `delete()`, and restores the prior flag in `finally`. `deleteActionFor` checks persistence before the force flag; `E_MODEL_NOT_PERSISTED` therefore takes precedence for an unpersisted model. Restore checks persistence, then force-deleted state, then loaded deletion state.

```ts
const user = await User.withTrashed().where('id', userId).firstOrFail()
await user.forceDelete()
```

`$forceDelete` is restored even if a hook or query fails. If an outer transaction rolls back a physical delete, the database row returns but the retained instance remains marked deleted; discard it and fetch a new model.
There is no dedicated `forceDeleteQuietly()` method; `deleteQuietly()` uses the physical quiet-delete path only when `$forceDelete` is already true.

## Builder lifecycle methods

Builder lifecycle methods operate on matching database rows, not hydrated instances. They return affected counts where noted, never run model hooks, never update model `updatedAt`, and bypass custom column `prepare` functions. `softDelete()` formats its local Luxon timestamp for the query connection's dialect. Pass a caller-owned client with `User.query({ client: trx })` or attach it with `.useTransaction(trx)`; the package does not begin, commit, or roll back a transaction.

The lifecycle macros require a model composed with `SoftDeletes` and a mapped `deletedAt` column. Missing model capability/column rejects with `E_MODEL_SOFT_DELETE`. Query and database errors propagate. Builder `restore()`, `softDelete()` and `forceDelete()` reject many-to-many and has-many-through relation builders before writing: Lucid redirects many-to-many writes to the pivot table and builds has-many-through writes with a sub-query the database rejects. Select related IDs and use a normal related-model query instead. A builder that has already run keeps the soft-delete filter from that run, so a later `delete()` on the same builder removes only the rows that run's mode selected. Start a new query for a bulk write.

### `softDelete()`

Sets the mapped deletion column for matching active rows.

- **Eligible rows:** Active matches in default or `withTrashed()` mode. In `onlyTrashed()` mode the method returns `0` without writing. Already trashed rows are excluded in other modes too.
- **Return/no-op:** `Promise<number>` affected count; zero when there are no active matches or mode is `onlyTrashed()`.
- **Hooks/state:** No model hooks or instance state changes. Does not update `updatedAt`; custom column `prepare` is bypassed.
- **Client/errors:** Uses the builder's client. Requires the mixin and mapped deletion column; rejects many-to-many and has-many-through relation builders before writing.
- **Receipt:** `softDelete({ receipt: true })` returns `SoftDeleteReceipt`; see [Receipts](#receipts).

```ts
const changed = await User.query().whereIn('id', ids).softDelete()
```

### Builder `restore()`

Clears the mapped deletion column on matching trashed rows, regardless of the builder's read mode.

- **Eligible rows:** Matches whose deletion column is non-null; active matches remain unchanged.
- **Return/no-op:** `Promise<number>` affected count, including `0` when nothing matched.
- **Hooks/state:** Direct bulk update. No model hooks or instance saves; `updatedAt` is unchanged and custom column `prepare` is bypassed.
- **Client/errors:** Uses the builder's client. A model without the mixin or mapped column rejects with `E_MODEL_SOFT_DELETE`; query errors propagate. Rejects many-to-many and has-many-through relation builders before writing; use a normal related-model query by IDs for relation-target lifecycle writes.
- **Receipt:** `restore({ receipt: true })` returns `RestoreReceipt`; see [Receipts](#receipts).

```ts
const restoredCount = await User.query().whereIn('id', ids).restore()
```

### Builder `forceDelete()`

Physically removes matching model rows.

- **Eligible rows:** In `onlyTrashed()` mode, only trashed matches; in default and `withTrashed()` modes, both active and trashed matches.
- **Return/no-op:** `Promise<number>` affected count, including `0` when nothing matched.
- **Hooks/state:** Direct physical delete. No model hooks, model state updates, or `updatedAt` changes.
- **Client/errors:** Uses the builder's client. Requires the mixin and mapped column; rejects many-to-many and has-many-through relation builders before writing. Database and foreign-key errors propagate.
- **Receipt:** `forceDelete({ receipt: true })` returns `ForceDeleteReceipt`; see [Receipts](#receipts).

```ts
const purgedCount = await User.query().onlyTrashed().whereIn('id', ids).forceDelete()
```

Use an explicit caller predicate or a trusted list of IDs; `forceDelete()` is destructive and default mode includes active matches.

### Receipts

Pass `{ receipt: true }` to a builder lifecycle method to return the primary keys of rows changed by the executed write:

```ts
await User.query().whereIn('id', ids).softDelete() // Promise<number>, unchanged
await User.query().whereIn('id', ids).softDelete({ receipt: true }) // Promise<SoftDeleteReceipt>
await User.query().whereIn('id', ids).restore({ receipt: true }) // Promise<RestoreReceipt>
await User.onlyTrashed().whereIn('id', ids).forceDelete({ receipt: true }) // Promise<ForceDeleteReceipt>
```

`{}` and `{ receipt: false }` behave exactly like no argument. The count-mode SQL and return values do not change.

```ts
const receipt = await db.transaction(async (trx) => {
  const result = await User.query({ client: trx }).whereIn('id', ids).softDelete({ receipt: true })
  for (const id of result.ids) {
    await trx.table('lifecycle_notes').insert({ tenant_id: 1, parent_id: id, action: 'softDelete' })
  }
  return result
})
```

The public types are:

```ts
import type { DateTime } from 'luxon'

/** Raw driver value of the model's primary key. A bigint from the driver is converted with String(). */
export type PrimaryKeyValue = number | string

export interface BulkReceiptOptions {
  receipt?: boolean
}

export interface BulkReceipt {
  /** Rows the write changed. Equals ids.length. */
  count: number
  /** Primary-key values of the changed rows. Set semantics: no defined order, no duplicates. */
  ids: PrimaryKeyValue[]
}

export type RestoreReceipt = BulkReceipt
export type ForceDeleteReceipt = BulkReceipt

export interface SoftDeleteReceipt extends BulkReceipt {
  /**
   * The instant the written literal denotes in the Node process zone, truncated to the
   * dialect's date-time format precision (milliseconds on PostgreSQL, seconds elsewhere).
   * null when count is 0.
   */
  deletedAt: DateTime | null
}
```

- `ids` and `count` describe the rows the executed statement changed, not the rows selected before it ran.
- The receipt describes an executed mutation inside the caller's transaction. It is not durable until the caller commits. It is not an audit log and does not authorise an undo.
- `deletedAt` is not unique per call and is not a recovery-group or ownership token. Two calls in the same second (or millisecond on PostgreSQL) produce equal values.
- Values in `ids` are raw driver values: PostgreSQL `bigint` arrives as a string; a driver configured to return `bigint` has it converted with `String()`. No `consume` function runs. Do not compare with `===` against `$primaryKeyValue` without normalising.
- Receipt mode requires a caller-owned transaction on every dialect (`Model.query({ client: trx })`, `.useTransaction(trx)`, or a global transaction). A non-transaction client rejects with `E_BULK_RECEIPT_REQUIRES_TRANSACTION` before any statement.
- Receipt mode never begins, commits or rolls back a transaction. When `E_BULK_RECEIPT_DIVERGED` is thrown the write has already executed inside the caller's transaction; the caller must roll back.
- Cost: PostgreSQL runs one statement with `RETURNING`. MySQL and SQLite run a `SELECT … FOR UPDATE` (SQLite ignores `FOR UPDATE`) followed by the write restricted to the selected keys, and hold the row locks until the caller commits. All ids are held in memory and, on MySQL/SQLite, sent back as bind parameters (SQLite's bound-parameter limit is 32766).
- Unsupported in receipt mode, rejected with `E_BULK_RECEIPT_UNSUPPORTED` before any statement: dialects other than `postgres`, `mysql`, `sqlite3`, `better-sqlite3`; has-one and belongs-to relation builders (many-to-many and has-many-through are already rejected by `ensureLifecycleWrite`); builders with joins, `groupBy`, `having`, `orderBy`, `limit`, `offset`, unions, aggregates, or a raw/sub-query `from`.
- A prior `returning()` on the builder is overridden on PostgreSQL and ignored elsewhere.
- Triggers and foreign-key cascades are outside the receipt: it reports the target table's rows only.
- Hooks, `updatedAt`, custom `prepare`, relation rejection and mode selection rules are identical to count mode.

| Error                                 | Code                                  | Message                                                                                                | Constructor                                                                                     |
| ------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `E_BULK_RECEIPT_REQUIRES_TRANSACTION` | `E_BULK_RECEIPT_REQUIRES_TRANSACTION` | `Bulk lifecycle receipts require a caller-owned transaction client`                                    | `()`                                                                                            |
| `E_BULK_RECEIPT_UNSUPPORTED`          | `E_BULK_RECEIPT_UNSUPPORTED`          | `Bulk lifecycle receipts do not support ${reason}`                                                     | `(reason: string)`                                                                              |
| `E_BULK_RECEIPT_DIVERGED`             | `E_BULK_RECEIPT_DIVERGED`             | `Bulk lifecycle write changed ${actual} rows but ${expected} were selected; roll back the transaction` | `(expected: number, actual: number)`; exposes `expected` and `actual` as public readonly fields |

### `delete()` and `del()`

Lucid builder `delete()` and its alias `del()` are physical deletes. They are not soft-delete methods, and `withTrashed()` or `onlyTrashed()` does not constrain these writes. On a fresh builder they operate on all matching active and trashed rows; a builder that has already run keeps that run's soft-delete filter, so start a new query for a bulk write. They run no model hooks, update no model timestamps, and return Lucid's write result. Use builder `softDelete()` for bulk recoverable deletion, or instance `delete()` when model hooks and save semantics are required.

```ts
// Physical deletion, even though onlyTrashed() is a read mode:
await User.onlyTrashed().whereIn('id', ids).delete()
```

The [operation chooser in the README](../README.md#choose-an-operation) puts the warning beside common choices. See [troubleshooting](troubleshooting.md#builder-delete-or-del-removed-rows-physically) for a diagnostic and recovery path.

## Scope boundaries and query behavior

Model fetch hooks scope the query's model. `pojo()`, raw database queries, joined models, and embedded subqueries do not become globally scoped. Joins and raw queries must add their own qualified deletion predicate when needed. `withTrashed()` affects the root model query only; choose a mode inside a preload or aggregate callback for the related model. OR grouping, aliases, group-limited preloads, and builder reuse have tested behavior and limitations documented in the [scope contract](scope-contract.md).

### Relationship aggregates and existence queries

`withCount`, `withAggregate`, `has`, `whereHas`, `doesntHave`, `loadCount`, and `loadAggregate` scope a soft-deletable related model inside the subquery. A callback's `withTrashed()` or `onlyTrashed()` changes that relation's mode without changing the parent query. A related model without the mixin is left alone.

```ts
const users = await User.query()
  .withCount('posts')
  .withCount('posts', (query) => query.withTrashed().as('all_posts'))
  .withCount('posts', (query) => query.onlyTrashed().as('trashed_posts'))
  .whereHas('posts', (query) => query.withTrashed().where('title', 'archived'))
```

The first count includes active posts, the second includes both states, and the third counts only trashed posts. The `whereHas` callback changes which related posts qualify without changing the user query's root read mode. See the [scope contract](scope-contract.md#relationship-aggregates-and-existence-queries) for coverage and edge cases.

## Caller-owned transactions and model state

Instance operations use the model's current query client. Use `instance.useTransaction(trx)` or fetch it through `User.query({ client: trx })`. Builder methods use the builder's current client; use `User.query({ client: trx })` or `User.query().useTransaction(trx)`. The package never owns the transaction boundary.

After an outer rollback, the database state is reverted but the retained model's attributes and Lucid tracking state are not rewound. For a soft delete or restore rollback, discard or refresh a still-existing instance before reuse. For a force-delete rollback, the retained instance remains `$isDeleted` and `refresh()` rejects; discard it and refetch. An after-hook error can happen after a successful SQL write, so without an enclosing caller transaction that write may already be durable. Hooks do not provide a durability boundary.

## Exports, guards, and TypeScript

The package root exports:

| Export                                                                                                              | Purpose                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `configure`                                                                                                         | Registers the provider in an AdonisJS application.                                                                            |
| `SoftDeletes`                                                                                                       | Model mixin.                                                                                                                  |
| `SoftDeletesInstance`, `SoftDeletesStatics`, `SoftDeletesConstructor`                                               | Type contracts for instance, static, and composed constructor APIs.                                                           |
| `SOFT_DELETES`, `hasSoftDeletes`, `SoftDeletesModel`                                                                | Symbol marker, runtime capability guard, and marker-narrowed model type. A `deletedAt` column alone does not qualify a model. |
| `E_MODEL_SOFT_DELETE`, `E_MODEL_FORCE_DELETED`, `E_MODEL_NOT_PERSISTED`, `E_MODEL_UNKNOWN_DELETION_STATE`           | Named exception classes and error-code definitions.                                                                           |
| `E_BULK_RECEIPT_REQUIRES_TRANSACTION`, `E_BULK_RECEIPT_UNSUPPORTED`, `E_BULK_RECEIPT_DIVERGED`                      | Named receipt exception classes and error-code definitions.                                                                   |
| `BulkReceiptOptions`, `BulkReceipt`, `PrimaryKeyValue`, `SoftDeleteReceipt`, `RestoreReceipt`, `ForceDeleteReceipt` | Receipt option and return types for bulk lifecycle methods.                                                                   |

The entry point loads the package's TypeScript module augmentations. They add `withTrashed`, `onlyTrashed`, `restore`, `softDelete`, and `forceDelete` to both `ModelQueryBuilderContract` in `@adonisjs/lucid/types/model` and `ModelQueryBuilder` in `@adonisjs/lucid/orm`; lifecycle methods include `{ receipt: true }` overloads. Lifecycle methods are typed only when the builder model has the `SOFT_DELETES` marker. The runtime provider must also be configured before calling builder macros.

```ts
import { hasSoftDeletes, SOFT_DELETES } from '@kevinjohn/lucid-soft-deletes'
import type { SoftDeletesModel } from '@kevinjohn/lucid-soft-deletes'

// `model` is an unknown value obtained from a dynamic model registry.
if (hasSoftDeletes(model)) {
  const capableModel: SoftDeletesModel = model
  console.log(capableModel[SOFT_DELETES]) // true
}
```

The guard checks the explicit marker set by the mixin; it does not infer capability from a coincidental `deletedAt` column or methods with similar names. The former `ModelWithSoftDeletes` augmentation is not part of this API.

## Errors

| Error                                 | When it is thrown                                                                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E_MODEL_SOFT_DELETE`                 | A read mode or lifecycle builder macro is used with a model without the mixin, or a scope/lifecycle macro needs a mapped `deletedAt` column that is missing.                                                          |
| `E_MODEL_NOT_PERSISTED`               | Instance `delete()`, `deleteQuietly()`, `restore()`, or `forceDelete()` is called before the model has been persisted. Persistence is checked before the force-delete flag.                                           |
| `E_MODEL_FORCE_DELETED`               | `restore()` is called on an instance Lucid marks as physically deleted.                                                                                                                                               |
| `E_MODEL_UNKNOWN_DELETION_STATE`      | `restore()` is called on a fetched instance whose projection omitted `deletedAt`; load the state or call `refresh()` if the row still exists.                                                                         |
| `E_BULK_RECEIPT_REQUIRES_TRANSACTION` | Receipt mode is used without a caller-owned transaction client.                                                                                                                                                       |
| `E_BULK_RECEIPT_UNSUPPORTED`          | Receipt mode is used with an unsupported dialect, relation builder, or query shape.                                                                                                                                   |
| `E_BULK_RECEIPT_DIVERGED`             | The write changed a different number of rows than the preselect; roll back the caller's transaction.                                                                                                                  |
| Query/hook/database error             | Propagates from Lucid, the database, or model hooks. Unique conflicts and foreign-key violations require application/schema-specific resolution. A failed PostgreSQL statement aborts its transaction until rollback. |

See [troubleshooting](troubleshooting.md) for recovery steps for projected models, uniqueness conflicts, transactions, and builder write surprises.
