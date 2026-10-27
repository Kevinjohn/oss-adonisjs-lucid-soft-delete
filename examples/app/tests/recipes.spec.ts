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
import {
  countActiveAllAndTrashedChildren,
  customDeletionColumnWithUtcSerialization,
  mutateAndBookkeepTogether,
  readDeletedParentWithIndependentChildModes,
  restoreAccidentallyDeletedRecord,
  restoreAfterUniqueConflict,
  softDeleteAndPurgeSelectedBatch,
} from '#services/soft_delete_recipes'

test.group('Published cookbook recipes', (group) => {
  group.each.setup(async () => {
    await db.from('lifecycle_notes').delete()
    await db.from('lifecycle_children').delete()
    await db.from('lifecycle_parents').delete()
  })

  test('restores an accidentally deleted row through a with-trashed read', async ({ assert }) => {
    assert.deepEqual(await restoreAccidentallyDeletedRecord(), {
      trashed: false,
      activeQueryFindsRow: true,
    })
  })

  test('keeps tenant and ID predicates on batch delete and purge', async ({ assert }) => {
    const result = await softDeleteAndPurgeSelectedBatch(41)
    assert.equal(result.deleted, 2)
    assert.equal(result.purged, 2)
    assert.isFalse(result.selectedRowsRemain)
    assert.isTrue(result.otherTenantRemains)
  })

  test('chooses parent and child read modes independently', async ({ assert }) => {
    const result = await readDeletedParentWithIndependentChildModes()
    assert.isTrue(result.parentIsTrashed)
    assert.deepEqual(result.defaultChildIds, [result.expectedActiveChildId])
    assert.sameMembers(result.allChildIds, [
      result.expectedActiveChildId,
      result.expectedDeletedChildId,
    ])
  })

  test('counts active, all, and trashed related rows', async ({ assert }) => {
    assert.deepEqual(await countActiveAllAndTrashedChildren(), { active: 2, all: 3, trashed: 1 })
  })

  test('commits or rolls back the package mutation and bookkeeping together', async ({
    assert,
  }) => {
    assert.deepEqual(await mutateAndBookkeepTogether('commit'), {
      trashed: true,
      noteCount: 1,
      externalEffects: 1,
    })
    assert.deepEqual(await mutateAndBookkeepTogether('rollback'), {
      trashed: false,
      noteCount: 0,
      externalEffects: 0,
    })
  })

  test('resolves a unique-value conflict before retrying restore', async ({ assert }) => {
    const result = await restoreAfterUniqueConflict()
    assert.isTrue(result.conflictObserved, JSON.stringify(result))
    assert.isTrue(result.remainsTrashedAfterConflict)
    assert.isTrue(result.restoredAfterConflictWasResolved)
  })

  test('maps the deletion attribute to a custom column and serializes UTC ISO', async ({
    assert,
  }) => {
    const { serialized, deletedAtIsLuxon } = await customDeletionColumnWithUtcSerialization()
    assert.isTrue(deletedAtIsLuxon)
    assert.equal(serialized.deletedAt, '2026-02-02T22:35:06.000Z')
  })
})
