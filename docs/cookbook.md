# Soft-delete cookbook

Use these recipes for common application tasks. They use the fixture models and tables described
below so each snippet has a concrete schema and imports. Replace the fixture table and tenant
values with your application's equivalents. These examples assume the package is configured in an
AdonisJS application and the fixture/application migrations that create the required columns have
already run.

## Contents

1. [Restore an accidentally deleted row](#restore-an-accidentally-deleted-row)
2. [Soft-delete and purge a selected batch](#soft-delete-and-purge-a-selected-batch)
3. [Read a deleted parent with independent child modes](#read-a-deleted-parent-with-independent-child-modes)
4. [Count active, all, and trashed related rows](#count-active-all-and-trashed-related-rows)
5. [Commit mutation and bookkeeping together](#commit-mutation-and-bookkeeping-together)
6. [Recover from a restore uniqueness conflict](#recover-from-a-restore-uniqueness-conflict)
7. [Map a custom deletion column and serialize UTC ISO](#map-a-custom-deletion-column-and-serialize-utc-iso)

## Shared fixture and imports

The setup and models below are complete for the recipes. The parent table has `id`, `tenant_id`,
`label`, `archived_at` (an unrelated application timestamp), and nullable `deleted_at`. The child
table has `id`, `tenant_id`, `parent_id`, `label`, and nullable `deleted_at`. `lifecycle_notes`
has `id`, `tenant_id`, `parent_id`, and `action`. `users` has `id`, unique `email`, `username`, and
nullable `deleted_at`. These are the tables created by
[`examples/app/database/migrations/0001_create_users_table.ts`](../examples/app/database/migrations/0001_create_users_table.ts)
and
[`examples/app/database/migrations/0002_create_lifecycle_tables.ts`](../examples/app/database/migrations/0002_create_lifecycle_tables.ts).
In a new application, create equivalent columns and a database unique constraint for values that
must remain unique; the recipes do not create tables or authorization rules.

The fixture uses `tenantId` in model queries, which Lucid maps to `tenant_id`. In your application,
keep your own authorization and tenant conditions in each mutation query.

<!-- source: ../examples/app/app/services/soft_delete_recipes.ts#RECIPE_SETUP -->

```ts
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

class RecipeParent extends compose(BaseModel, SoftDeletes) {
  static table = 'lifecycle_parents'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare label: string
  @column.dateTime() declare archivedAt: DateTime | null
  @hasMany(() => RecipeChild, { foreignKey: 'parentId' }) declare children: HasMany<
    typeof RecipeChild
  >
}

class RecipeChild extends compose(BaseModel, SoftDeletes) {
  static table = 'lifecycle_children'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare parentId: number
  @column() declare label: string
}

class CustomDeletionParent extends compose(BaseModel, SoftDeletes) {
  static table = 'lifecycle_parents'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare label: string
  @column.dateTime({
    columnName: 'archived_at',
    serialize: (value: DateTime | null) => value?.toUTC().toISO() ?? null,
  })
  declare deletedAt: DateTime | null
}

function uniqueLabel(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random()}`
}
```

The examples below show service-level operations; add request validation, authorization, and
response handling in your own application boundary.

## Restore an accidentally deleted row

Use a `withTrashed()` query to find a row that the default scope hides, then call its instance
`restore()` method. The row becomes visible to ordinary queries again.

<!-- source: ../examples/app/app/services/soft_delete_recipes.ts#ACCIDENTAL_RESTORE -->

```ts
export async function restoreAccidentallyDeletedRecord() {
  const row = await RecipeParent.create({
    tenantId: 1,
    label: uniqueLabel('restore'),
    archivedAt: null,
  })
  await row.delete()

  const found = await RecipeParent.withTrashed()
    .where('tenantId', 1)
    .where('id', row.id)
    .firstOrFail()
  await found.restore()

  const restored = await RecipeParent.withTrashed().where('id', row.id).firstOrFail()
  const active = await RecipeParent.find(row.id)
  return {
    trashed: restored.trashed,
    activeQueryFindsRow: Boolean(active),
  }
}
```

Expected result: `trashed` is `false`, and the normal active-only `find` succeeds. Keep the
authorization and tenant predicates on the `withTrashed()` lookup; `withTrashed()` changes
soft-delete visibility, not access control. If uniqueness constraints conflict, see
[the conflict recipe](#recover-from-a-restore-uniqueness-conflict).

## Soft-delete and purge a selected batch

Use `softDelete()` for a bulk update and `onlyTrashed().forceDelete()` for a physical purge. Carry
the complete caller selection, including tenant and selected IDs, onto both queries. `delete()` and
`del()` are physical query-builder deletes and do not mean soft delete.

<!-- source: ../examples/app/app/services/soft_delete_recipes.ts#TENANT_BATCH -->

```ts
export async function softDeleteAndPurgeSelectedBatch(tenantId: number) {
  const first = await RecipeParent.create({
    tenantId,
    label: uniqueLabel('batch-a'),
    archivedAt: null,
  })
  const second = await RecipeParent.create({
    tenantId,
    label: uniqueLabel('batch-b'),
    archivedAt: null,
  })
  const unselectedSameTenant = await RecipeParent.create({
    tenantId,
    label: uniqueLabel('batch-unselected'),
    archivedAt: null,
  })
  const otherTenant = await RecipeParent.create({
    tenantId: tenantId + 1,
    label: uniqueLabel('batch-other'),
    archivedAt: null,
  })
  const trashedOtherTenant = await RecipeParent.create({
    tenantId: tenantId + 1,
    label: uniqueLabel('batch-older-trash-other'),
    archivedAt: null,
    deletedAt: DateTime.local(),
  })
  const trashedUnselectedSameTenant = await RecipeParent.create({
    tenantId,
    label: uniqueLabel('batch-older-trash-unselected'),
    archivedAt: null,
    deletedAt: DateTime.local(),
  })
  const selectedIds = [first.id, second.id, otherTenant.id, trashedOtherTenant.id]

  const deleted = await RecipeParent.query()
    .where('tenantId', tenantId)
    .whereIn('id', selectedIds)
    .softDelete()
  const purged = await RecipeParent.query()
    .onlyTrashed()
    .where('tenantId', tenantId)
    .whereIn('id', selectedIds)
    .forceDelete()

  return {
    deleted,
    purged,
    selectedRowsRemain: Boolean(
      await RecipeParent.withTrashed().whereIn('id', [first.id, second.id]).first()
    ),
    otherTenantRemains: Boolean(await RecipeParent.find(otherTenant.id)),
    unselectedSameTenantRemains: Boolean(await RecipeParent.find(unselectedSameTenant.id)),
    trashedOtherTenantRemains: Boolean(
      await RecipeParent.onlyTrashed().where('id', trashedOtherTenant.id).first()
    ),
    trashedUnselectedSameTenantRemains: Boolean(
      await RecipeParent.onlyTrashed().where('id', trashedUnselectedSameTenant.id).first()
    ),
  }
}
```

Expected result: two rows are soft-deleted and then physically removed; the selected ID from
another tenant and an unselected row from the same tenant both remain active. The builder methods do
not run per-model hooks. They operate on the rows selected by your predicates and return the
affected-row count. Ensure the IDs and tenant scope come from trusted application state.

## Read a deleted parent with independent child modes

The parent's and each related query's visibility modes are independent. Use `withTrashed()` on the
parent query to read a deleted parent. Choose the child mode in the preload callback; without it,
children remain active-only.

<!-- source: ../examples/app/app/services/soft_delete_recipes.ts#PARENT_CHILD_READ_MODES -->

```ts
export async function readDeletedParentWithIndependentChildModes() {
  const parent = await RecipeParent.create({
    tenantId: 1,
    label: uniqueLabel('parent'),
    archivedAt: null,
  })
  const activeChild = await RecipeChild.create({
    tenantId: 1,
    parentId: parent.id,
    label: 'active',
  })
  const deletedChild = await RecipeChild.create({
    tenantId: 1,
    parentId: parent.id,
    label: 'deleted',
  })
  await parent.delete()
  await deletedChild.delete()

  const parentWithActiveChildren = await RecipeParent.withTrashed()
    .where('tenantId', 1)
    .where('id', parent.id)
    .preload('children')
    .firstOrFail()
  const parentWithAllChildren = await RecipeParent.withTrashed()
    .where('tenantId', 1)
    .where('id', parent.id)
    .preload('children', (query) => query.withTrashed())
    .firstOrFail()

  return {
    parentIsTrashed: parentWithActiveChildren.trashed,
    defaultChildIds: parentWithActiveChildren.children.map((child) => child.id),
    allChildIds: parentWithAllChildren.children.map((child) => child.id),
    expectedActiveChildId: activeChild.id,
    expectedDeletedChildId: deletedChild.id,
  }
}
```

Expected result: the parent is trashed; the first preload includes only the active child; the second
includes both children. If a child query also needs a tenant restriction, add it to that callback.
Parent `withTrashed()` does not bypass child scopes or tenant rules.

## Count active, all, and trashed related rows

Set the mode separately inside each aggregate callback. The default related count includes active
children, `withTrashed()` counts all children, and `onlyTrashed()` counts just deleted children.

<!-- source: ../examples/app/app/services/soft_delete_recipes.ts#RELATED_COUNTS -->

```ts
export async function countActiveAllAndTrashedChildren() {
  const parent = await RecipeParent.create({
    tenantId: 1,
    label: uniqueLabel('count'),
    archivedAt: null,
  })
  await RecipeChild.create({ tenantId: 1, parentId: parent.id, label: 'active one' })
  await RecipeChild.create({ tenantId: 1, parentId: parent.id, label: 'active two' })
  const trashed = await RecipeChild.create({ tenantId: 1, parentId: parent.id, label: 'trashed' })
  await trashed.delete()

  const counted = await RecipeParent.query()
    .where('tenantId', 1)
    .where('id', parent.id)
    .withCount('children', (query) => query.as('active_children'))
    .withCount('children', (query) => query.withTrashed().as('all_children'))
    .withCount('children', (query) => query.onlyTrashed().as('trashed_children'))
    .firstOrFail()

  return {
    active: Number(counted.$extras.active_children),
    all: Number(counted.$extras.all_children),
    trashed: Number(counted.$extras.trashed_children),
  }
}
```

Expected result for the seeded rows: `{ active: 2, all: 3, trashed: 1 }`. The aggregate applies to
the related model; it does not change the root parent's visibility.

## Commit mutation and bookkeeping together

Pass the caller-owned transaction to the model query and write application bookkeeping through the
same transaction. Register external work with the transaction's `after('commit')` callback. A
rollback leaves the row active, creates no note, and runs no after-commit callback. After rollback,
discard model instances used in the transaction and refetch them before reuse; the in-memory model
is not rewound by the database rollback.

<!-- source: ../examples/app/app/services/soft_delete_recipes.ts#TRANSACTION_BOOKKEEPING -->

```ts
export async function mutateAndBookkeepTogether(outcome: 'commit' | 'rollback') {
  const row = await RecipeParent.create({
    tenantId: 1,
    label: uniqueLabel('transaction'),
    archivedAt: null,
  })
  let externalEffects = 0

  try {
    await db.transaction(async (trx) => {
      const selected = await RecipeParent.query({ client: trx })
        .where('tenantId', 1)
        .where('id', row.id)
        .firstOrFail()
      await selected.delete()
      await trx
        .table('lifecycle_notes')
        .insert({ tenant_id: 1, parent_id: row.id, action: outcome })
      trx.after('commit', async () => {
        externalEffects += 1 // Enqueue email/webhook here; never send it before commit.
      })
      if (outcome === 'rollback') throw new Error('bookkeeping failed')
    })
  } catch (error) {
    if (outcome !== 'rollback') throw error
    if (!(error instanceof Error) || error.message !== 'bookkeeping failed') throw error
  }

  const result = await RecipeParent.withTrashed().where('id', row.id).firstOrFail()
  const notes = await db.from('lifecycle_notes').where('parent_id', row.id)
  return { trashed: result.trashed, noteCount: notes.length, externalEffects }
}
```

Expected commit result: `{ trashed: true, noteCount: 1, externalEffects: 1 }`. Expected rollback
result: `{ trashed: false, noteCount: 0, externalEffects: 0 }`. The package uses the Lucid client
bound to the model query; the application owns authorization, bookkeeping, transaction boundaries,
and delivery retries for external effects. An after-commit callback avoids sending before the
transaction commits, but durable delivery across process failure requires an application outbox or
equivalent mechanism.

## Recover from a restore uniqueness conflict

Instance `restore()` clears `deletedAt` through model `save()`, so other dirty attributes may be
persisted and model hooks and `updatedAt` behavior apply. Restore does not resolve a collision on
another unique key. This executable fixture adds a temporary partial unique index on active parent
labels to demonstrate the conflict. In your application, put the equivalent index in a migration
for the real key that must be unique among active rows.

<!-- source: ../examples/app/app/services/soft_delete_recipes.ts#RESTORE_UNIQUENESS_CONFLICT -->

```ts
export async function restoreAfterUniqueConflict() {
  // The fixture uses a temporary index; applications should create this index in a migration.
  const indexName = 'lifecycle_parents_active_label_unique'
  await db.rawQuery(
    `CREATE UNIQUE INDEX ${indexName} ON lifecycle_parents (label) WHERE deleted_at IS NULL`
  )
  try {
    const label = uniqueLabel('unique')
    const deleted = await RecipeParent.create({ tenantId: 1, label, archivedAt: null })
    await deleted.delete()
    const currentOwner = await RecipeParent.create({ tenantId: 1, label, archivedAt: null })

    let conflict: unknown
    try {
      await deleted.restore()
    } catch (error) {
      conflict = error
    }

    const stateAfterAttempt = await RecipeParent.withTrashed()
      .where('tenantId', 1)
      .where('id', deleted.id)
      .firstOrFail()
    await currentOwner.forceDelete()
    if (stateAfterAttempt.trashed) await deleted.restore()
    const restored = await RecipeParent.withTrashed().where('id', deleted.id).firstOrFail()
    return {
      conflictObserved: conflict instanceof Error,
      remainsTrashedAfterConflict: stateAfterAttempt.trashed,
      restoredAfterConflictWasResolved: !restored.trashed,
    }
  } finally {
    await db.rawQuery(`DROP INDEX IF EXISTS ${indexName}`)
  }
}
```

Expected result: the first restore conflicts and the retry succeeds only after the active owner is
removed. In production, map the relevant database constraint error to a domain-level conflict and
choose an explicit recovery: ask the user to choose a new value, merge/rename the conflicting
record under application policy, or use a uniqueness design that permits reuse while a row is
trashed. A partial unique index such as `email` where `deleted_at IS NULL` is supported by some
databases (including PostgreSQL and SQLite); index syntax and support differ by database. MySQL
does not provide the same partial-index syntax, so a generated nullable key or another schema
design may be needed. Validate index semantics and migration support for your engine.

If the uniqueness error occurs inside a transaction, do not assume that transaction can continue.
PostgreSQL marks a transaction failed after a statement error; roll back the transaction or use a
savepoint strategy supported by your driver and transaction nesting before attempting recovery.
The simpler portable flow is to catch the conflict outside the failed transaction, resolve it in a
new transaction, then retry the restore. Do not issue a blind retry: the conflict can remain or a
different unique value can collide.

## Map a custom deletion column and serialize UTC ISO

The mixin expects a model attribute named `deletedAt`; map that attribute to a differently named
database column with `columnName`. The column serializer changes only the serialized value; the
attribute remains a Luxon `DateTime` for application code. This fixture maps it to `archived_at`,
which is safe here because this recipe uses the parent table's existing column as its deletion
timestamp. In a real schema, do not reuse a column that already stores a separate archive value.

The `CustomDeletionParent` definition is in the shared setup. The operation below shows the
datetime assignment and serialized result:

<!-- source: ../examples/app/app/services/soft_delete_recipes.ts#CUSTOM_COLUMN_UTC_SERIALIZATION -->

```ts
export async function customDeletionColumnWithUtcSerialization() {
  const row = await CustomDeletionParent.create({
    tenantId: 1,
    label: uniqueLabel('custom-column'),
    deletedAt: DateTime.fromISO('2026-02-03T04:05:06.000+05:30'),
  })

  const serialized = row.serialize()
  const deletedAt = row.deletedAt
  const stored = await db.from('lifecycle_parents').where('id', row.id).first()
  const customColumnWritten = stored.archived_at !== null
  const defaultDeletedColumnIsNull = stored.deleted_at === null
  await row.forceDelete()

  return {
    serialized,
    deletedAtIsLuxon: DateTime.isDateTime(deletedAt),
    customColumnWritten,
    defaultDeletedColumnIsNull,
  }
}
```

Expected result: the model attribute is still a Luxon `DateTime`, `archived_at` contains the
timestamp, the mixin's default `deleted_at` column stays null, and `serialized.deletedAt` is
`2026-02-02T22:35:06.000Z`. The serializer normalizes the instant to UTC ISO 8601; it does not
change the database timezone or the value held by the model.
