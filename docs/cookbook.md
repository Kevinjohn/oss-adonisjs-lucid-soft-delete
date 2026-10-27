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
6. [Record the rows a batch changed](#record-the-rows-a-batch-changed)
7. [Recover from a restore uniqueness conflict](#recover-from-a-restore-uniqueness-conflict)
8. [Map a custom deletion column and serialize UTC ISO](#map-a-custom-deletion-column-and-serialize-utc-iso)
9. [Recover an application-owned deletion group](#recover-an-application-owned-deletion-group)

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
  // Restoring a selected row before the purge makes it active, so onlyTrashed() keeps it.
  await RecipeParent.query()
    .onlyTrashed()
    .where('tenantId', tenantId)
    .where('id', second.id)
    .restore()
  const purged = await RecipeParent.query()
    .onlyTrashed()
    .where('tenantId', tenantId)
    .whereIn('id', selectedIds)
    .forceDelete()

  return {
    deleted,
    purged,
    purgedRowRemains: Boolean(await RecipeParent.withTrashed().where('id', first.id).first()),
    restoredRowRemains: Boolean(await RecipeParent.find(second.id)),
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

Expected result: two rows are soft-deleted; one is restored before the purge, so the purge
physically removes only the other and the restored row stays active. The selected ID from another
tenant and an unselected row from the same tenant both remain active. The builder methods do
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

## Record the rows a batch changed

Use a receipt inside a caller-owned transaction when the application needs to write bookkeeping
for exactly the rows changed by a batch mutation. The mutation and notes commit or roll back
together.

<!-- source: ../examples/app/app/services/soft_delete_recipes.ts#RECEIPT_BOOKKEEPING -->

```ts
export async function softDeleteWithReceipt(tenantId: number) {
  const rows = await Promise.all(
    ['receipt-a', 'receipt-b'].map((prefix) =>
      RecipeParent.create({ tenantId, label: uniqueLabel(prefix), archivedAt: null })
    )
  )
  const receipt = await db.transaction(async (trx) => {
    const result = await RecipeParent.query({ client: trx })
      .where('tenantId', tenantId)
      .whereIn(
        'id',
        rows.map((row) => row.id)
      )
      .softDelete({ receipt: true })
    for (const id of result.ids) {
      await trx
        .table('lifecycle_notes')
        .insert({ tenant_id: tenantId, parent_id: id, action: 'softDelete' })
    }
    return result
  })
  const notes = await db.from('lifecycle_notes').where('tenant_id', tenantId)
  return { count: receipt.count, noteCount: notes.length, hasTimestamp: receipt.deletedAt !== null }
}
```

**Expected result:** two notes, one per changed id, committed with the mutation.

The receipt's timestamp is `null` and its `ids` list is empty when nothing matched.

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

## Recover an application-owned deletion group

An application can recover the rows actually deleted by one operation using the existing
count-returning APIs. Keep recovery groups and each row's current deletion owner in application
storage. A deletion timestamp is useful state, but it is not a unique deletion-generation ID:
two delete operations can write the same timestamp.

This recipe uses fictional records and a plain tenant column. Authorization, whether a group is
usable, when it may be invalidated or cleaned up, and transaction ownership are application
responsibilities. Complete the policy check before invoking these functions; pass an explicit
tenant and selected row IDs. All mutation and bookkeeping queries use the caller's transaction.
Only publish notifications or other external effects after that transaction commits.

### Schema and setup

Keep the shared `lifecycle_parents` table above. Apply the example's
[recovery migration](../examples/app/database/migrations/0003_create_recovery_tables.ts)
with the existing application migrations before invoking the service. It adds only:

- `recovery_groups`: UUID primary key `id`, integer `tenant_id`, `label`, `status` and `created_at`.
  Status is `usable`, `invalidated` or `consumed`; a consumed group cannot be reused.
- `recovery_records`: integer `tenant_id` and `record_id` as a composite primary key, `group_id`
  referencing a recovery group, and the captured `deleted_at`. This is the **current** association,
  not an immutable history table. A new deletion replaces an earlier association for the same row.

The fixture migrations run automatically in both installed-consumer gates. No new package
configuration or installation command is needed; follow the [tutorial setup](tutorial.md#prerequisites-and-source-checkout)
for an installed app. The service imports only public packed package exports:

<!-- source: ../examples/app/app/services/group_recovery.ts#GROUP_RECOVERY_SETUP -->

```ts
import { randomUUID } from 'node:crypto'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

export class RecoverableRecord extends compose(BaseModel, SoftDeletes) {
  static table = 'lifecycle_parents'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare label: string
  @column.dateTime() declare archivedAt: DateTime | null
  @column.dateTime() declare deletedAt: DateTime | null
}

function requireAffected(count: number | number[], message: string) {
  const affected = Array.isArray(count) ? count.length : count
  if (affected !== 1) throw new Error(message)
}
```

### Transactional operations

Save the following operations in the same service file. `deleteGroup` reads active candidates
with tenant and ID predicates, then includes a row only when its conditional `softDelete()` reports
one changed row. Rows already deleted and rows from another tenant never enter the new group.
The captured deletion timestamp is bookkeeping; the UUID association identifies its generation.

`restoreGroup` requires a usable group and current trashed rows, consumes the group, restores
those rows and removes their associations in one transaction. It preserves IDs and unrelated
application timestamps such as `archived_at`; `deleted_at` becomes null. `invalidateGroup`
disables restoration while retaining ownership for cleanup. `purgeGroup` requires an invalidated
group and explicit selected IDs that still belong to it. It uses `onlyTrashed().forceDelete()`;
a partial purge keeps the group invalidated until its final current association is removed.

Every writer of these rows and associations must follow the same serialization protocol.
The service locks the relevant rows and associations using the supplied transaction. Databases
with row locks honor `forUpdate()`; SQLite uses its transaction write lock. Applications must
handle transaction conflicts/deadlocks and retry the **whole** transaction as appropriate for
their database. Do not combine this protocol with uncoordinated restore, delete or ownership
writes and assume a timestamp comparison can reconstruct deletion ownership.

<!-- source: ../examples/app/app/services/group_recovery.ts#GROUP_RECOVERY_OPERATIONS -->

```ts
/**
 * Create a one-use recovery group for rows this transaction actually soft-deletes.
 * All code that changes these rows must use this transaction protocol and serialize
 * writes per tenant and ID. Row locks help on databases that support them; SQLite
 * relies on its transaction write lock. Every caller must use the same rule.
 */
export async function deleteGroup(
  trx: TransactionClientContract,
  input: { tenantId: number; ids: number[]; label: string }
) {
  const ids = [...new Set(input.ids)]
  if (ids.length === 0) throw new Error('A recovery group requires at least one row ID')

  // Lock and read only active rows. The conditional package operation below remains
  // authoritative: a row enters this group only when softDelete reports one update.
  const candidates = await RecoverableRecord.query({ client: trx })
    .where('tenantId', input.tenantId)
    .whereIn('id', ids)
    .forUpdate()
  const groupId = randomUUID()
  const createdAt = new Date()
  await trx.table('recovery_groups').insert({
    id: groupId,
    tenant_id: input.tenantId,
    label: input.label,
    status: 'usable',
    created_at: createdAt,
  })

  let captured = 0
  for (const candidate of candidates) {
    const affected = await RecoverableRecord.query({ client: trx })
      .where('tenantId', input.tenantId)
      .where('id', candidate.id)
      .softDelete()
    if (affected !== 1) continue

    const deleted = await RecoverableRecord.query({ client: trx })
      .withTrashed()
      .where('tenantId', input.tenantId)
      .where('id', candidate.id)
      .firstOrFail()
    if (!deleted.trashed || !deleted.deletedAt)
      throw new Error('Deleted row timestamp was not recorded')

    // The row may have been restored outside this recipe after a group's mapping
    // became stale. Reassign its current ownership before recording this deletion.
    await trx
      .from('recovery_records')
      .where('tenant_id', input.tenantId)
      .where('record_id', candidate.id)
      .delete()

    await trx.table('recovery_records').insert({
      tenant_id: input.tenantId,
      record_id: candidate.id,
      group_id: groupId,
      deleted_at: deleted.deletedAt.toJSDate(),
    })
    captured += 1
  }

  if (captured === 0) throw new Error('No active rows were deleted for this recovery group')
  return groupId
}

/** Disable restoration while retaining current ownership records for cleanup. */
export async function invalidateGroup(
  trx: TransactionClientContract,
  input: { tenantId: number; groupId: string }
) {
  const affected = await trx
    .from('recovery_groups')
    .where('tenant_id', input.tenantId)
    .where('id', input.groupId)
    .where('status', 'usable')
    .update({ status: 'invalidated' })
  requireAffected(affected, 'Recovery group is missing or is no longer usable')
}

/** Restore a usable group once, preserving all non-deletion fields and original IDs. */
export async function restoreGroup(
  trx: TransactionClientContract,
  input: { tenantId: number; groupId: string }
) {
  const group = await trx
    .from('recovery_groups')
    .where('tenant_id', input.tenantId)
    .where('id', input.groupId)
    .forUpdate()
    .first()
  if (!group || group.status !== 'usable')
    throw new Error('Recovery group is missing or already consumed')

  const records = await trx
    .from('recovery_records')
    .where('tenant_id', input.tenantId)
    .where('group_id', input.groupId)
    .forUpdate()
  if (records.length === 0) throw new Error('Recovery group has no current row associations')

  const ids = records.map((record) => record.record_id)
  const rows = await RecoverableRecord.query({ client: trx })
    .withTrashed()
    .where('tenantId', input.tenantId)
    .whereIn('id', ids)
    .forUpdate()
  if (rows.length !== ids.length || rows.some((row) => !row.trashed)) {
    throw new Error('Recovery group no longer owns every selected trashed row')
  }

  requireAffected(
    await trx
      .from('recovery_groups')
      .where('tenant_id', input.tenantId)
      .where('id', input.groupId)
      .where('status', 'usable')
      .update({ status: 'consumed' }),
    'Recovery group is missing or already consumed'
  )
  const restored = await RecoverableRecord.query({ client: trx })
    .onlyTrashed()
    .where('tenantId', input.tenantId)
    .whereIn('id', ids)
    .restore()
  if (restored !== rows.length) throw new Error('Restore did not recover every current row')
  await trx
    .from('recovery_records')
    .where('tenant_id', input.tenantId)
    .where('group_id', input.groupId)
    .delete()
  return rows.length
}

/**
 * Permanently remove explicitly selected rows from an invalidated group. The current
 * association is checked before using onlyTrashed().forceDelete(), so an old group
 * cannot delete a row that a later deletion assigned to another group.
 */
export async function purgeGroup(
  trx: TransactionClientContract,
  input: { tenantId: number; groupId: string; ids: number[] }
) {
  const group = await trx
    .from('recovery_groups')
    .where('tenant_id', input.tenantId)
    .where('id', input.groupId)
    .forUpdate()
    .first()
  if (!group || group.status !== 'invalidated') {
    throw new Error('Recovery group is missing or is not invalidated')
  }

  const ids = [...new Set(input.ids)]
  if (ids.length === 0) throw new Error('Purge requires at least one selected row ID')
  const records = await trx
    .from('recovery_records')
    .where('tenant_id', input.tenantId)
    .where('group_id', input.groupId)
    .whereIn('record_id', ids)
    .forUpdate()
  if (records.length !== ids.length)
    throw new Error('Selected rows are not currently owned by this group')

  const rows = await RecoverableRecord.query({ client: trx })
    .onlyTrashed()
    .where('tenantId', input.tenantId)
    .whereIn('id', ids)
    .forUpdate()
  if (rows.length !== ids.length)
    throw new Error('Selected rows are not currently trashed for this tenant')

  const affected = await RecoverableRecord.query({ client: trx })
    .onlyTrashed()
    .where('tenantId', input.tenantId)
    .whereIn('id', ids)
    .forceDelete()
  if (affected !== ids.length) throw new Error('Purge did not remove every selected row')

  await trx
    .from('recovery_records')
    .where('tenant_id', input.tenantId)
    .where('group_id', input.groupId)
    .whereIn('record_id', ids)
    .delete()
  const remaining = await trx
    .from('recovery_records')
    .where('tenant_id', input.tenantId)
    .where('group_id', input.groupId)
    .count('* as total')
    .first()
  if (Number(remaining?.total ?? 0) === 0) {
    requireAffected(
      await trx
        .from('recovery_groups')
        .where('tenant_id', input.tenantId)
        .where('id', input.groupId)
        .where('status', 'invalidated')
        .update({ status: 'consumed' }),
      'Recovery group changed during purge'
    )
  }
  return affected
}
```

### Invoke a complete lifecycle

This maintained invocation is exercised by
[`group_recovery_example.spec.ts`](../examples/app/tests/group_recovery_example.spec.ts).
Run it in the migrated fixture app, for example by importing and awaiting
`demonstrateGroupRecovery()` from an application command. Each `db.transaction` below is the
caller-owned unit of work; the recipe operations never commit it themselves.

<!-- source: ../examples/app/app/services/group_recovery_example.ts#GROUP_RECOVERY_EXAMPLE -->

```ts
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import {
  RecoverableRecord,
  deleteGroup,
  invalidateGroup,
  purgeGroup,
  restoreGroup,
} from '#services/group_recovery'

export async function demonstrateGroupRecovery() {
  const tenantId = 41
  const archivedAt = DateTime.fromISO('2026-01-02T03:04:05.000Z')
  const first = await RecoverableRecord.create({ tenantId, label: 'Alder', archivedAt })
  const second = await RecoverableRecord.create({ tenantId, label: 'Birch', archivedAt })
  const active = await RecoverableRecord.create({ tenantId, label: 'Cedar', archivedAt })
  const older = await RecoverableRecord.create({
    tenantId,
    label: 'Elm',
    archivedAt,
    deletedAt: DateTime.fromISO('2026-01-03T00:00:00.000Z'),
  })
  const other = await RecoverableRecord.create({ tenantId: 42, label: 'Fir', archivedAt })
  const ids = [first.id, second.id]

  const originalGroup = await db.transaction((trx) =>
    deleteGroup(trx, {
      tenantId,
      ids: [...ids, older.id, other.id],
      label: 'First removal',
    })
  )
  const restored = await db.transaction((trx) =>
    restoreGroup(trx, { tenantId, groupId: originalGroup })
  )
  const restoredRows = await RecoverableRecord.query()
    .where('tenantId', tenantId)
    .whereIn('id', ids)
  const nextGroup = await db.transaction((trx) =>
    deleteGroup(trx, { tenantId, ids, label: 'Second removal' })
  )

  // A consumed group cannot restore or purge this later deletion. See the tests
  // for rejected calls and rollback after either operation's bookkeeping.
  const purged = await db.transaction(async (trx) => {
    // The application's authorization and cleanup-eligibility checks precede this.
    await invalidateGroup(trx, { tenantId, groupId: nextGroup })
    return purgeGroup(trx, { tenantId, groupId: nextGroup, ids: [first.id] })
  })
  const remaining = await RecoverableRecord.withTrashed()
    .whereIn('id', [...ids, active.id, older.id, other.id])
    .orderBy('id')
  const groups = await db.from('recovery_groups').whereIn('id', [originalGroup, nextGroup])
  const associations = await db.from('recovery_records').where('group_id', nextGroup)
  return {
    ids,
    originalGroup,
    nextGroup,
    restored,
    restoredRows,
    purged,
    remaining,
    groups,
    associations,
  }
}
```

The IDs are assigned by the database. `originalGroup` and `nextGroup` are different UUIDs even
when two deletion timestamps coincide. Both Alder and Birch retain their original IDs and
`archived_at = 2026-01-02T03:04:05.000Z` when restored. Expected state:

| Record | Tenant | Before             | First deletion | Restore original group | Second deletion | Purge selected Alder      |
| ------ | ------ | ------------------ | -------------- | ---------------------- | --------------- | ------------------------- |
| Alder  | 41     | Active             | Original group | Active, same ID        | Next group      | Permanently removed       |
| Birch  | 41     | Active             | Original group | Active, same ID        | Next group      | Still trashed, next group |
| Cedar  | 41     | Active, unselected | Active         | Active                 | Active          | Active                    |
| Elm    | 41     | Already trashed    | Outside group  | Still trashed          | Still trashed   | Still trashed             |
| Fir    | 42     | Active             | Outside group  | Active                 | Active          | Active                    |

`restored` is 2 and `purged` is 1. The original group is consumed; the next group is invalidated
with only Birch still associated. A later eligible cleanup can purge Birch by its explicit ID.
The tests also prove that successful selected cleanup preserves another tenant's already-trashed
row, and rejected cleanup preserves an active row with a stale association. Restoring one usable
group leaves another usable group in the same tenant unchanged.

### Errors and rollback

Let errors escape the caller's transaction callback so both the package mutation and application
bookkeeping roll back. Catch them outside `await db.transaction(...)`. Catching an error inside
the callback and committing would defeat this atomicity guarantee.

- Missing, wrong-tenant, consumed or invalidated groups cannot be restored. Calling restoration
  twice rejects the second call. A usable group with no current associations also rejects.
- After restoring and deleting again, attempts to restore or purge with the original consumed
  group reject, leaving the newer deletion timestamp and ownership unchanged.
- Cleanup rejects usable groups, unowned IDs, active rows, and IDs now associated with a newer
  group. A failed selection does not partially purge the group. Invalidation is an application
  policy decision; it is not authorization by itself.
- If the caller throws after `deleteGroup` completes its bookkeeping, the rows remain active,
  no new group is persisted and no associations remain.
- If the caller throws after `restoreGroup` completes its bookkeeping, the rows retain their
  exact deletion timestamps, the group stays usable and its original associations remain.
  A later valid transaction may retry restoration.

The installed-consumer
[`group_recovery.spec.ts`](../examples/app/tests/group_recovery.spec.ts) imports these exact
operations and compares persisted row, group and association state across success, stale cleanup
and rollback. Run `pnpm docs:check`, `pnpm test:consumer` and
`pnpm test:consumer --compatibility=minimum` from the repository root with Node 24 and pnpm 11.
This recipe composes existing APIs and does not depend on a future rich bulk-result API.
