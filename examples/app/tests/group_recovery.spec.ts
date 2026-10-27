/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 */

import { test } from '@japa/runner'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import db from '@adonisjs/lucid/services/db'
import { DateTime, Settings } from 'luxon'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'
import { deleteGroup, invalidateGroup, purgeGroup, restoreGroup } from '#services/group_recovery'

class TestRecord extends compose(BaseModel, SoftDeletes) {
  static table = 'lifecycle_parents'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare label: string
  @column.dateTime() declare archivedAt: DateTime | null
  @column.dateTime() declare deletedAt: DateTime | null
}

async function seed(tenantId: number, label: string, deletedAt: DateTime | null = null) {
  return TestRecord.create({
    tenantId,
    label,
    archivedAt: DateTime.fromISO('2026-01-02T03:04:05.000Z'),
    deletedAt,
  })
}

async function isTrashed(id: number) {
  const record = await TestRecord.withTrashed().where('id', id).firstOrFail()
  return record.trashed
}

async function deletedTimestamp(id: number) {
  const record = await TestRecord.withTrashed().where('id', id).firstOrFail()
  return record.deletedAt!.toUTC().toISO()
}

async function recoveryStatus(groupId: string) {
  const group = await db.from('recovery_groups').where('id', groupId).first()
  return group.status
}

async function currentGroupFor(id: number) {
  const association = await db.from('recovery_records').where('record_id', id).first()
  return association.group_id
}

async function capturedDeletedAt(groupId: string, id: number) {
  const association = await db
    .from('recovery_records')
    .where('group_id', groupId)
    .where('record_id', id)
    .first()
  return association.deleted_at
}

test.group('Application-owned group recovery', (group) => {
  group.each.setup(async () => {
    await db.from('recovery_records').delete()
    await db.from('recovery_groups').delete()
    await db.from('lifecycle_notes').delete()
    await db.from('lifecycle_children').delete()
    await db.from('lifecycle_parents').delete()
  })

  test('associates only selected rows newly deleted for the requested tenant', async ({
    assert,
  }) => {
    const selected = await seed(41, 'selected')
    const alreadyDeleted = await seed(41, 'already', DateTime.fromISO('2026-01-03T00:00:00.000Z'))
    const otherTenant = await seed(42, 'other')
    const unselected = await seed(41, 'unselected')
    let groupId = ''
    await db.transaction(async (trx) => {
      groupId = await deleteGroup(trx, {
        tenantId: 41,
        ids: [selected.id, alreadyDeleted.id, otherTenant.id],
        label: 'batch',
      })
    })

    const storedGroup = await db.from('recovery_groups').where('id', groupId).first()
    const associations = await db.from('recovery_records').where('group_id', groupId)
    assert.equal(storedGroup.status, 'usable')
    assert.deepEqual(
      associations.map((row) => row.record_id),
      [selected.id]
    )
    assert.isTrue(await isTrashed(selected.id))
    assert.isTrue(await isTrashed(alreadyDeleted.id))
    assert.isFalse(await isTrashed(otherTenant.id))
    assert.isFalse(await isTrashed(unselected.id))
    assert.equal(await deletedTimestamp(alreadyDeleted.id), '2026-01-03T00:00:00.000Z')
  })

  test('restores a group once with original IDs and timestamps, then creates a fresh group on re-delete', async ({
    assert,
    cleanup,
  }) => {
    const previousNow = Settings.now
    Settings.now = () => Date.parse('2026-05-06T07:08:09.000Z')
    cleanup(() => {
      Settings.now = previousNow
    })
    const originalTimestamp = DateTime.fromISO('2026-02-03T04:05:06.000Z')
    const first = await TestRecord.create({
      tenantId: 7,
      label: 'first',
      archivedAt: originalTimestamp,
    })
    const second = await TestRecord.create({
      tenantId: 7,
      label: 'second',
      archivedAt: originalTimestamp,
    })
    let originalGroup = ''
    await db.transaction(async (trx) => {
      originalGroup = await deleteGroup(trx, {
        tenantId: 7,
        ids: [first.id, second.id],
        label: 'restore',
      })
    })
    const deletedAt = await deletedTimestamp(first.id)
    const capturedTimestamp = await capturedDeletedAt(originalGroup, first.id)
    assert.equal(new Date(capturedTimestamp).getTime(), Date.parse(deletedAt!))
    await db.transaction((trx) => restoreGroup(trx, { tenantId: 7, groupId: originalGroup }))

    const restored = await TestRecord.withTrashed()
      .whereIn('id', [first.id, second.id])
      .orderBy('id')
    assert.deepEqual(
      restored.map((row) => row.id),
      [first.id, second.id]
    )
    assert.isTrue(restored.every((row) => !row.trashed))
    assert.isTrue(restored.every((row) => row.archivedAt!.toISO() === originalTimestamp.toISO()))
    assert.equal(await recoveryStatus(originalGroup), 'consumed')
    assert.isEmpty(await db.from('recovery_records').where('group_id', originalGroup))
    await assert.rejects(
      () => db.transaction((trx) => restoreGroup(trx, { tenantId: 7, groupId: originalGroup })),
      'Recovery group is missing or already consumed'
    )

    let nextGroup = ''
    await db.transaction(async (trx) => {
      nextGroup = await deleteGroup(trx, {
        tenantId: 7,
        ids: [first.id, second.id],
        label: 'again',
      })
    })
    assert.notEqual(nextGroup, originalGroup)
    await assert.rejects(
      () => db.transaction((trx) => restoreGroup(trx, { tenantId: 7, groupId: originalGroup })),
      'Recovery group is missing or already consumed'
    )
    await assert.rejects(
      () =>
        db.transaction((trx) =>
          purgeGroup(trx, { tenantId: 7, groupId: originalGroup, ids: [first.id] })
        ),
      'Recovery group is missing or is not invalidated'
    )
    const newerDeletion = await TestRecord.withTrashed().where('id', first.id).firstOrFail()
    assert.equal(newerDeletion.deletedAt!.toUTC().toISO(), deletedAt)
    assert.equal(await currentGroupFor(first.id), nextGroup)
    assert.equal(await recoveryStatus(nextGroup), 'usable')
  })

  test('restoring one usable group preserves another usable group in the same tenant', async ({
    assert,
  }) => {
    const first = await seed(8, 'first group')
    const second = await seed(8, 'second group')
    const firstGroup = await db.transaction((trx) =>
      deleteGroup(trx, { tenantId: 8, ids: [first.id], label: 'first' })
    )
    const secondGroup = await db.transaction((trx) =>
      deleteGroup(trx, { tenantId: 8, ids: [second.id], label: 'second' })
    )
    const secondBefore = await db.from('lifecycle_parents').where('id', second.id)
    const associationBefore = await db.from('recovery_records').where('group_id', secondGroup)
    const restored = await db.transaction((trx) =>
      restoreGroup(trx, { tenantId: 8, groupId: firstGroup })
    )
    assert.equal(restored, 1)
    assert.isFalse(await isTrashed(first.id))
    assert.equal(await recoveryStatus(firstGroup), 'consumed')
    assert.isEmpty(await db.from('recovery_records').where('group_id', firstGroup))
    assert.deepEqual(await db.from('lifecycle_parents').where('id', second.id), secondBefore)
    assert.deepEqual(
      await db.from('recovery_records').where('group_id', secondGroup),
      associationBefore
    )
    assert.equal(await recoveryStatus(secondGroup), 'usable')
    assert.equal(
      await db.transaction((trx) => restoreGroup(trx, { tenantId: 8, groupId: secondGroup })),
      1
    )
    assert.isFalse(await isTrashed(second.id))
    assert.equal(await recoveryStatus(secondGroup), 'consumed')
  })

  test('purges only invalidated, currently owned rows and rejects wrong-tenant or consumed groups', async ({
    assert,
  }) => {
    const row = await seed(9, 'purge')
    let groupId = ''
    await db.transaction(async (trx) => {
      groupId = await deleteGroup(trx, { tenantId: 9, ids: [row.id], label: 'old' })
    })
    await assert.rejects(() =>
      db.transaction((trx) => restoreGroup(trx, { tenantId: 10, groupId }))
    )
    await db.transaction((trx) => invalidateGroup(trx, { tenantId: 9, groupId }))
    await assert.rejects(() =>
      db.transaction((trx) => purgeGroup(trx, { tenantId: 9, groupId, ids: [row.id + 100] }))
    )
    await db.transaction((trx) => purgeGroup(trx, { tenantId: 9, groupId, ids: [row.id] }))
    assert.isNull(await TestRecord.withTrashed().where('id', row.id).first())
    assert.equal(await recoveryStatus(groupId), 'consumed')
    await assert.rejects(() =>
      db.transaction((trx) => purgeGroup(trx, { tenantId: 9, groupId, ids: [row.id] }))
    )
    await assert.rejects(() =>
      db.transaction((trx) => invalidateGroup(trx, { tenantId: 9, groupId }))
    )
  })

  test('stale cleanup cannot purge a row restored and assigned to a newer deletion group', async ({
    assert,
  }) => {
    const row = await seed(12, 'new ownership')
    let staleGroup = ''
    await db.transaction(async (trx) => {
      staleGroup = await deleteGroup(trx, { tenantId: 12, ids: [row.id], label: 'stale' })
      await invalidateGroup(trx, { tenantId: 12, groupId: staleGroup })
    })
    // Simulate a legacy writer that restored the row without clearing the old app mapping.
    await TestRecord.withTrashed()
      .where('tenantId', 12)
      .where('id', row.id)
      .firstOrFail()
      .then((record) => record.restore())
    let currentGroup = ''
    await db.transaction(async (trx) => {
      currentGroup = await deleteGroup(trx, { tenantId: 12, ids: [row.id], label: 'current' })
    })

    await assert.rejects(() =>
      db.transaction((trx) => purgeGroup(trx, { tenantId: 12, groupId: staleGroup, ids: [row.id] }))
    )
    assert.equal(await currentGroupFor(row.id), currentGroup)
    assert.isTrue(await isTrashed(row.id))
    await db.transaction(async (trx) => {
      await invalidateGroup(trx, { tenantId: 12, groupId: currentGroup })
      await purgeGroup(trx, { tenantId: 12, groupId: currentGroup, ids: [row.id] })
    })
    assert.isNull(await TestRecord.withTrashed().where('id', row.id).first())
  })

  test('partial cleanup preserves active, unselected, and other-tenant rows until final purge', async ({
    assert,
  }) => {
    const first = await seed(15, 'first owned')
    const second = await seed(15, 'second owned')
    const unselected = await seed(15, 'unselected active')
    const otherActive = await seed(16, 'other tenant active')
    const otherTrashed = await seed(
      16,
      'other tenant trashed',
      DateTime.fromISO('2026-03-04T00:00:00.000Z')
    )
    let groupId = ''
    await db.transaction(async (trx) => {
      groupId = await deleteGroup(trx, {
        tenantId: 15,
        ids: [first.id, second.id, otherActive.id, otherTrashed.id],
        label: 'partial',
      })
      await invalidateGroup(trx, { tenantId: 15, groupId })
    })

    assert.equal(await recoveryStatus(groupId), 'invalidated')
    await db.transaction((trx) => purgeGroup(trx, { tenantId: 15, groupId, ids: [first.id] }))
    assert.isNull(await TestRecord.withTrashed().where('id', first.id).first())
    assert.isTrue(await isTrashed(second.id))
    assert.isFalse(await isTrashed(unselected.id))
    assert.isFalse(await isTrashed(otherActive.id))
    assert.isTrue(await isTrashed(otherTrashed.id))
    assert.equal(await recoveryStatus(groupId), 'invalidated')

    await db.transaction((trx) => purgeGroup(trx, { tenantId: 15, groupId, ids: [second.id] }))
    assert.isNull(await TestRecord.withTrashed().where('id', second.id).first())
    assert.equal(await recoveryStatus(groupId), 'consumed')
  })

  test('cleanup preserves an active row even when a legacy restore left its association', async ({
    assert,
  }) => {
    const row = await seed(17, 'active with stale ownership')
    const groupId = await db.transaction(async (trx) => {
      const id = await deleteGroup(trx, { tenantId: 17, ids: [row.id], label: 'legacy' })
      await invalidateGroup(trx, { tenantId: 17, groupId: id })
      return id
    })
    // Simulate a legacy writer; active-row protection must remain effective.
    const record = await TestRecord.withTrashed().where('id', row.id).firstOrFail()
    await record.restore()
    const before = await db.from('lifecycle_parents').where('id', row.id)
    await assert.rejects(
      () => db.transaction((trx) => purgeGroup(trx, { tenantId: 17, groupId, ids: [row.id] })),
      'Selected rows are not currently trashed for this tenant'
    )
    assert.deepEqual(await db.from('lifecycle_parents').where('id', row.id), before)
    assert.equal(await currentGroupFor(row.id), groupId)
    assert.equal(await recoveryStatus(groupId), 'invalidated')
  })

  test('rolls row changes and recovery bookkeeping back together on delete and restore', async ({
    assert,
  }) => {
    const row = await seed(11, 'rollback')
    const beforeDeleteRows = await db.from('lifecycle_parents').where('tenant_id', 11)
    let groupId = ''
    await assert.rejects(
      () =>
        db.transaction(async (trx) => {
          groupId = await deleteGroup(trx, { tenantId: 11, ids: [row.id], label: 'rollback' })
          throw new Error('reject delete')
        }),
      'reject delete'
    )
    assert.deepEqual(await db.from('lifecycle_parents').where('tenant_id', 11), beforeDeleteRows)
    assert.isNull(await db.from('recovery_groups').where('id', groupId).first())
    assert.isEmpty(await db.from('recovery_records').where('record_id', row.id))

    await db.transaction(async (trx) => {
      groupId = await deleteGroup(trx, { tenantId: 11, ids: [row.id], label: 'restore rollback' })
    })
    const beforeRestoreRows = await db.from('lifecycle_parents').where('tenant_id', 11)
    const beforeRestoreGroup = await db.from('recovery_groups').where('id', groupId)
    const beforeRestoreAssociations = await db.from('recovery_records').where('group_id', groupId)
    await assert.rejects(
      () =>
        db.transaction(async (trx) => {
          await restoreGroup(trx, { tenantId: 11, groupId })
          throw new Error('reject restore')
        }),
      'reject restore'
    )
    assert.deepEqual(await db.from('lifecycle_parents').where('tenant_id', 11), beforeRestoreRows)
    assert.deepEqual(
      await db.from('recovery_records').where('group_id', groupId),
      beforeRestoreAssociations
    )
    assert.deepEqual(await db.from('recovery_groups').where('id', groupId), beforeRestoreGroup)
  })
})
