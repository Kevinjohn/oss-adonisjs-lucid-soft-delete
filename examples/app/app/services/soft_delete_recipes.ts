/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file distributed with this source code.
 */

// #region RECIPE_SETUP
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
// #endregion RECIPE_SETUP

// #region ACCIDENTAL_RESTORE
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
// #endregion ACCIDENTAL_RESTORE

// #region TENANT_BATCH
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
// #endregion TENANT_BATCH

// #region PARENT_CHILD_READ_MODES
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
// #endregion PARENT_CHILD_READ_MODES

// #region RELATED_COUNTS
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
// #endregion RELATED_COUNTS

// #region TRANSACTION_BOOKKEEPING
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
// #endregion TRANSACTION_BOOKKEEPING

// #region RECEIPT_BOOKKEEPING
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
// #endregion RECEIPT_BOOKKEEPING

// #region RESTORE_UNIQUENESS_CONFLICT
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
// #endregion RESTORE_UNIQUENESS_CONFLICT

// #region CUSTOM_COLUMN_UTC_SERIALIZATION
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
// #endregion CUSTOM_COLUMN_UTC_SERIALIZATION
