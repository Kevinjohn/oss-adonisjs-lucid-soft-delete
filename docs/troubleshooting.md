# Troubleshooting

Use these checks when a query or lifecycle operation does not behave as expected. For setup and normal usage, see the [tutorial](tutorial.md), [cookbook](cookbook.md), and [API reference](api.md). See [Contributing](../CONTRIBUTING.md) for project development guidance.

Examples below use `Record` for a model composed with `SoftDeletes`, and `db` for the configured Lucid database service. Code marked **Contextual fragment** assumes those names are already in scope. Database constraints and application policy remain the caller's responsibility.

## `withTrashed`, `onlyTrashed`, or `softDelete` is missing

**Likely cause:** The provider has not booted, the model does not use the mixin, or the installed package version is incompatible with the project's AdonisJS/Lucid versions. A `deletedAt` column by itself does not install model scopes or builder macros.

**Check:** Confirm that `@kevinjohn/lucid-soft-deletes/provider` is listed under `providers` in `adonisrc.ts`, and that the model extends `compose(BaseModel, SoftDeletes)`. The provider registers the builder macros during `boot()`.

**Correction:** Register the provider (or run the package's configure command), and compose the model with the mixin:

```ts
// Contextual fragment in adonisrc.ts.
providers: [() => import('@kevinjohn/lucid-soft-deletes/provider')]
```

```ts
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

export default class Record extends compose(BaseModel, SoftDeletes) {
  static table = 'records'

  @column({ isPrimary: true })
  declare id: number
}
```

Then restart the application so its provider boot sequence runs again. `withTrashed()` and `onlyTrashed()` are available on model queries; builder lifecycle methods such as `softDelete()`, `restore()`, and `forceDelete()` also require the provider macros.

**Expected result:** A normal model query returns rows with `deleted_at IS NULL`; `Record.withTrashed()` includes both states, and `Record.onlyTrashed()` returns rows with a deletion timestamp.

Source and tests: [provider](../providers/lucid_soft_deletes_provider.ts), [model builder bindings](../src/bindings/model_query_builder.ts), [model API tests](../tests/unit/model.spec.ts), [builder guard tests](../tests/unit/builder_guard.spec.ts).

## Queries fail because `deleted_at` is missing or uses the wrong column

**Likely cause:** The table has no nullable timestamp column, or the model's `deletedAt` property maps to a different database column than the migration created. By default the mixin maps `deletedAt` to `deleted_at`.

**Check:** Compare the model column mapping with the actual schema. The timestamp must accept `NULL` for active rows. For a renamed column, check that every model using the mixin maps its property to that exact column.

**Correction:** Add the nullable column or map it explicitly. For a table using `removed_at`:

```ts
import { DateTime } from 'luxon'
import { column } from '@adonisjs/lucid/orm'

// Contextual fragment inside a SoftDeletes model.
@column.dateTime({ columnName: 'removed_at' })
declare deletedAt: DateTime | null
```

The matching migration should create that database column as a nullable timestamp:

```ts
// Contextual fragment inside the migration's createTable callback.
table.timestamp('removed_at').nullable()
```

Do not declare a second `deletedAt` property alongside the mixin's default property; override its mapping as above.

**Expected result:** Active rows have `removed_at = NULL`; instance deletes set it, and restore clears it. Queries and builder lifecycle macros resolve the database column from the model mapping.

Source and tests: [mixin column and query mapping](../src/mixin.ts), [scope column resolution](../src/scope.ts), [schema tests](../tests/unit/schema.spec.ts), [renamed-column builder tests](../tests/unit/builder_lifecycle.spec.ts).

## Deleted rows appear in `pojo()`, raw queries, or joins

**Likely cause:** `pojo()` and raw database queries do not hydrate the model and therefore do not run its fetch hooks. A model scope also applies to the model being fetched; it is not a global filter on every table named by a join.

**Check:** Identify which path creates the query. `Record.query().pojo()`, `db.from(...)`, and `db.rawQuery(...)` are outside the model fetch scope. On a join, check whether the joined table's soft-delete predicate is present in the join condition or `WHERE` clause.

**Correction:** Use a normal model query when you want the model scope. For a raw/pojo query or joined table, add an explicit predicate using the mapped database column and the query's table alias:

```ts
// Contextual fragment: both tables have a nullable `deleted_at` column.
const activeRows = await db
  .from('users as u')
  .leftJoin('posts as p', (join) => {
    join.on('p.user_id', 'u.id').andOnNull('p.deleted_at')
  })
  .whereNull('u.deleted_at')
  .select('u.id', 'p.id as post_id')
```

The `LEFT JOIN` keeps active users that have no active post, including users whose posts are all deleted. Keep the child predicate in `ON` (as above), or join a subquery already filtered to active posts. Putting it in `WHERE` can remove those users; grouping the `WHERE` condition does not change that result. For an inner join, an explicit child `WHERE` predicate is another option.

For a model query converted to plain objects, scope it before converting results, or explicitly constrain the query:

```ts
// Contextual fragment.
const rows = await Record.query().whereNull('records.deleted_at').pojo()
```

Use the actual table name or alias and the model's mapped column name. `withTrashed()` disables the scope for that model query; it does not add scope predicates to other tables.

**Expected result:** Each table's deleted rows are included or excluded according to an explicit predicate, and outer-join results retain the parents your join is intended to keep.

Source and tests: [scope hooks](../src/mixin.ts), [scope application](../src/scope.ts), [scope bypass tests](../tests/unit/scope_bypass.spec.ts), [relation scope tests](../tests/unit/scope_relations.spec.ts).

## Root `withTrashed()` does not change a preload or aggregate

**Likely cause:** A root query and each related query have separate read modes. `Record.withTrashed()` affects the root model; it does not change the mode on a related model's preload or aggregate subquery.

**Check:** Inspect the relation callback. Without a callback selecting a mode, a soft-deletable related model remains in the default active-only mode even when the root includes trashed rows.

**Correction:** Select a mode for the relation that needs it:

```ts
// Contextual fragments: `User` has a hasMany relation named `posts`.
const users = await User.withTrashed().preload('posts', (posts) => posts.withTrashed())

const counts = await User.query().withCount('posts', (posts) =>
  posts.onlyTrashed().as('trashed_posts')
)
```

Use the callback on `preload`, `load`, `withCount`, `withAggregate`, `whereHas`, or the corresponding load methods when changing a related query's mode. A mode in an aggregate callback changes the aggregate subquery, not the root result set. `has()` accepts the relation name and optional operator/count, not a callback. For a mode-aware existence check, use `whereHas()`:

```ts
const usersWithDeletedPosts = await User.query().whereHas('posts', (posts) => posts.onlyTrashed())
```

**Expected result:** Each root and relation query includes active rows by default, or uses the mode explicitly selected for that query.

Source and tests: [query mode propagation](../src/propagation.ts), [relation subquery scope](../src/sub_query_scope.ts), [relation scope tests](../tests/unit/scope_relations.spec.ts), [aggregate tests](../tests/unit/scope_aggregates.spec.ts), [mode bypass tests](../tests/unit/scope_bypass.spec.ts).

## Builder `delete()` or `del()` removed rows physically

**Likely cause:** Instance `delete()` soft-deletes a model. Query builder `delete()` and `del()` retain Lucid's physical bulk-delete behavior. `withTrashed()` and `onlyTrashed()` are read modes and do not make those methods soft-delete operations.

**Check:** Determine whether the call is on a model instance or a builder. Builder `delete()`/`del()` can physically remove matching active and trashed rows under any read mode.

**Correction:** For a bulk soft delete, use the lifecycle macro:

```ts
// Contextual fragment. This sets deletedAt on matching active rows.
const changed = await Record.query().whereIn('id', ids).softDelete()
```

The macro returns the affected row count. It bypasses model instances and hooks. If per-instance hooks and model save behavior are required, fetch the intended models and call `delete()` on each one:

```ts
// Contextual fragment.
const records = await Record.query().whereIn('id', ids)
for (const record of records) await record.delete()
```

Use builder `forceDelete()` only when physical removal is intended. Scope it with an explicit predicate; `onlyTrashed().forceDelete()` restricts it to trashed matches, while default and `withTrashed()` modes allow both active and trashed matches. The database's foreign-key rules still apply.

**Expected result:** `softDelete()` updates the timestamp and leaves rows present. `forceDelete()` physically removes only the selected matches.

Source and tests: [builder macros](../src/bindings/model_query_builder.ts), [scope bypass tests](../tests/unit/scope_bypass.spec.ts), [builder lifecycle tests](../tests/unit/builder_lifecycle.spec.ts).

## `restore()` rejects an unsaved, force-deleted, or projected model

**Likely cause:** Instance restore needs a persisted model and its deletion state. It rejects an unpersisted model with `E_MODEL_NOT_PERSISTED`, an instance already force-deleted with `E_MODEL_FORCE_DELETED`, and a fetched projection that did not load `deletedAt` with `E_MODEL_UNKNOWN_DELETION_STATE`.

**Check:** Inspect the error code and the query's selected columns. A query such as `.select('id')` does not tell the instance whether its row is active or trashed.

**Correction:** Restore a persisted, non-force-deleted instance fetched with the deletion column present. The easiest recovery for a projected but still-persisted instance is `refresh()`; the mixin makes refresh include trashed rows. Alternatively, refetch all model columns with `withTrashed()`:

```ts
// Contextual fragment: `projected` is still persisted and has not been force-deleted.
await projected.refresh()
await projected.restore()

// Or refetch by a stable key, loading the deletion state explicitly.
const record = await Record.query().withTrashed().where('id', recordId).firstOrFail()
await record.restore()
```

If the instance was never saved, persist it before a lifecycle operation where that makes sense. If it was force-deleted, do not call `refresh()` on that instance: a refresh cannot recover a row that no longer exists. If the database row still exists because the physical delete was rolled back, discard the stale instance and fetch a new one with `withTrashed()` after the rollback.

**Expected result:** A persisted trashed instance with `deletedAt` loaded restores and becomes active. Active instances return unchanged. Invalid states continue to reject instead of guessing.

Source and tests: [restore guards and refresh behavior](../src/mixin.ts), [error definitions](../src/errors.ts), [lifecycle guard tests](../tests/unit/lifecycle.spec.ts), [refresh scope tests](../tests/unit/scope.spec.ts).

## Restore fails on a unique value; a PostgreSQL transaction stays aborted

**Likely cause:** A different active row now uses a value protected by a unique constraint. Restoring sets the old row's deletion timestamp to `NULL`, so the database correctly rejects the duplicate. In PostgreSQL, a statement error aborts the current transaction; later statements fail until it is rolled back.

**Check:** Inspect the database error and unique index. In PostgreSQL, SQLSTATE `23505` indicates a unique violation; `25P02` on a later query indicates the transaction is aborted. Check whether the conflicting active row owns the same unique value.

**Correction:** Do not retry within the failed PostgreSQL transaction. Roll it back first, then resolve the value conflict according to application rules (for example, choose another value or remove/update the competing row). Retry in a fresh transaction and re-fetch the trashed model so the attempt uses current database state:

```ts
// Contextual fragment. Resolve the conflicting active value before retrying.
const trx = await db.transaction()
try {
  const record = await Record.query({ client: trx })
    .withTrashed()
    .where('id', recordId)
    .firstOrFail()
  await record.restore()
  await trx.commit()
} catch (error) {
  if (!trx.isCompleted) await trx.rollback()
  throw error
}
```

Run the retry only after the conflict has been handled; automatically retrying the same value will fail again. Do not drop or weaken a uniqueness constraint as a generic recovery. An active-only unique index is one schema design that permits value reuse by active rows, but it still rejects restoring a row while another active row has that value.

**Expected result:** A conflicting restore remains rejected and the trashed row stays trashed. After the conflict is resolved, a fresh transaction can restore it successfully.

Source and tests: [instance restore](../src/mixin.ts), [PostgreSQL uniqueness and aborted-transaction tests](../tests/unit/uniqueness.spec.ts).

## A rollback changed the database but my retained model still looks changed

**Likely cause:** A transaction rollback reverts database writes, not in-memory model attributes or Lucid's `$original`, `$dirty`, and deletion tracking state. The instance reflects the operation it completed before the rollback.

**Check:** Compare a fresh query with the retained instance. After rolling back a soft delete, the database row may be active while the retained model still has a deletion timestamp. After a rolled-back force delete, the old instance may remain marked deleted and cannot be refreshed.

**Correction:** Discard the instance after rollback and fetch a new one from the database. Use `withTrashed()` when it may be necessary to find either state:

```ts
// Contextual fragment. The transaction has already rolled back.
const current = await Record.query().withTrashed().where('id', recordId).firstOrFail()
```

For a rolled-back force delete, query again by a stable key instead of calling `refresh()` on the old instance. If the transaction committed, the row is physically gone and the query returns no record.

**Expected result:** The new instance reflects committed database state. The previous object remains stale and should not be reused for writes.

Source and tests: [transaction state tests](../tests/unit/transactions.spec.ts), [instance persistence and force-delete state](../src/mixin.ts).

## A many-to-many or has-many-through bulk lifecycle write is rejected

**Likely cause:** Lucid routes a many-to-many relation builder's writes through the pivot table and builds has-many-through writes with a sub-query the database rejects. The package rejects builder `restore()`, `softDelete()` and `forceDelete()` on both relation builders before writing, because those methods target related model rows, not pivot links or the intermediate model.

**Check:** Confirm whether the write is being called on a many-to-many or has-many-through relation query, such as `parent.related('tags').query()`. The error explains that lifecycle writes on these relation builders are unsupported.

**Correction:** Read the related IDs through the relation query, then issue a lifecycle write on the related model query with those IDs. The related query scopes the selected IDs to the parent relation; choosing a normal model builder for the write avoids redirecting the update/delete to the pivot:

```ts
// Contextual fragment: User.tags is a many-to-many relation to Tag.
const related = await user.related('tags').query().select('tags.id')
const tagIds = related.map((tag) => tag.id)

if (tagIds.length > 0) {
  await Tag.query().whereIn('id', tagIds).softDelete()
}
```

This marks the selected active related rows as trashed and leaves pivot rows intact. A shared tag is changed for every parent that references it, so its visibility changes through other users too. If the goal is only to remove this user's association, detach the selected pivot links with `await user.related('tags').detach(tagIds)` instead of deleting the tag model. The relation query is active-only by default. If physical removal of trashed related rows is required, select those IDs with `onlyTrashed()`, first handle the pivot rows according to the relation and database constraints, then call `forceDelete()` on a normal related-model query restricted to those IDs. Do not bypass or disable foreign-key constraints to make the delete succeed.

**Expected result:** The lifecycle macro operates on related model rows selected through the parent relation; the pivot table is not mistaken for the model table, and its foreign-key references are preserved.

Source and tests: [relation lifecycle guard](../src/bindings/model_query_builder.ts), [builder lifecycle relation tests](../tests/unit/builder_lifecycle.spec.ts).

## A receipt call is rejected or throws E_BULK_RECEIPT_DIVERGED

**Likely cause:** Receipt mode requires a caller-owned transaction on every supported dialect. It also rejects unsupported dialects, has-one and belongs-to relation builders, and query shapes with joins, grouping, having, ordering, limits, offsets, unions, aggregates, or a raw/sub-query `from`.

**Check:** Confirm the builder uses `Model.query({ client: trx })`, `.useTransaction(trx)`, or a global transaction. Check for unsupported clauses and relation types before the call; these receipt-mode rejections happen before any statement. `E_BULK_RECEIPT_DIVERGED` means the write changed a different number of rows than the preselect returned.

**Correction:** Remove unsupported query shapes or query related model rows by IDs with a supported builder. If `E_BULK_RECEIPT_DIVERGED` is thrown, the write has already run inside the caller's transaction, so roll back that transaction before continuing. The package does not roll it back automatically.

**Expected result:** The caller commits the mutation and bookkeeping together after a matching receipt, or rolls back the transaction after divergence.

## Hooks, `updatedAt`, custom `prepare`, or serialized fields differ in bulk operations

**Likely cause:** Instance and builder operations use different persistence paths. Instance `delete()` and `restore()` save the model, so Lucid model hooks, automatic timestamps, and column preparation apply as they do to model saves. Builder `softDelete()`, `restore()`, and `forceDelete()` update/delete rows directly: they do not run per-instance hooks, do not automatically update `updatedAt`, and bypass custom column `prepare` functions. Serialization applies when producing serialized output, independently of the write path.

**Check:** Identify whether the operation was invoked on a model instance or a query builder. Also distinguish persistence from JSON serialization: `serializeAs` controls serialized output, not the database column mapping or query scope.

**Correction:** If hooks, automatic `updatedAt`, or custom `prepare` behavior is required, fetch the intended models and call instance methods:

```ts
// Contextual fragment.
const records = await Record.query().whereIn('id', ids)
for (const record of records) await record.delete()
```

Use builder lifecycle macros when their direct bulk-write behavior is acceptable. If a custom mapping is used, map the property with `columnName` to the real database column. If a timestamp should be omitted from or renamed in serialized output, configure `serializeAs`; that does not rename its database column. The `trashed` getter is derived from the loaded `deletedAt` attribute and is not serialized as a model column.

For example, hide a mapped timestamp from serialized output while retaining its persistence mapping:

```ts
// Contextual fragment inside a SoftDeletes model.
@column.dateTime({ columnName: 'removed_at', serializeAs: null })
declare deletedAt: DateTime | null
```

**Expected result:** Instance saves run the normal Lucid model lifecycle. Builder macros make direct bulk changes without instance hooks, automatic `updatedAt`, or custom `prepare`; serialization changes affect only serialized representations.

Source and tests: [instance persistence](../src/mixin.ts), [builder macros](../src/bindings/model_query_builder.ts), [builder lifecycle tests](../tests/unit/builder_lifecycle.spec.ts), [serialization tests](../tests/unit/serialisation.spec.ts).
