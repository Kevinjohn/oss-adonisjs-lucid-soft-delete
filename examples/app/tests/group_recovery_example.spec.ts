/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file distributed with this source code.
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { demonstrateGroupRecovery } from '#services/group_recovery_example'

test.group('Cookbook group recovery invocation', (group) => {
  group.each.setup(async () => {
    await db.from('recovery_records').delete()
    await db.from('recovery_groups').delete()
    await db.from('lifecycle_notes').delete()
    await db.from('lifecycle_children').delete()
    await db.from('lifecycle_parents').delete()
  })

  test('matches the documented rows and group states', async ({ assert }) => {
    const result = await demonstrateGroupRecovery()
    assert.equal(result.restored, 2)
    assert.sameMembers(
      result.restoredRows.map((row) => row.id),
      result.ids
    )
    assert.isTrue(result.restoredRows.every((row) => !row.trashed))
    assert.isTrue(
      result.restoredRows.every(
        (row) => row.archivedAt!.toUTC().toISO() === '2026-01-02T03:04:05.000Z'
      )
    )
    assert.notEqual(result.originalGroup, result.nextGroup)
    assert.equal(result.purged, 1)
    assert.deepEqual(
      result.remaining.map((row) => [row.label, row.tenantId, row.trashed]),
      [
        ['Birch', 41, true],
        ['Cedar', 41, false],
        ['Elm', 41, true],
        ['Fir', 42, false],
      ]
    )
    assert.equal(
      result.groups.find((group) => group.id === result.originalGroup).status,
      'consumed'
    )
    assert.equal(result.groups.find((group) => group.id === result.nextGroup).status, 'invalidated')
    assert.deepEqual(
      result.associations.map((row) => row.record_id),
      [result.ids[1]]
    )
  })
})
