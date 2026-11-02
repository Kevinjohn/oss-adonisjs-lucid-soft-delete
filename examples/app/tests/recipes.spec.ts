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
  softDeleteWithReceipt,
} from '#services/soft_delete_recipes'
import env from '#start/env'

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
    assert.equal(result.purged, 1)
    assert.isFalse(result.purgedRowRemains)
    assert.isTrue(result.restoredRowRemains)
    assert.isTrue(result.otherTenantRemains)
    assert.isTrue(result.unselectedSameTenantRemains)
    assert.isTrue(result.trashedOtherTenantRemains)
    assert.isTrue(result.trashedUnselectedSameTenantRemains)
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

  test('records one bookkeeping note for every changed receipt id', async ({ assert }) => {
    assert.deepEqual(await softDeleteWithReceipt(77), {
      count: 2,
      noteCount: 2,
      hasTimestamp: true,
    })
  })

  test('resolves a unique-value conflict before retrying restore', async ({ assert }) => {
    const result = await restoreAfterUniqueConflict()
    assert.isTrue(result.conflictObserved, JSON.stringify(result))
    assert.isTrue(result.remainsTrashedAfterConflict)
    assert.isTrue(result.restoredAfterConflictWasResolved)
  })

  test('propagates unexpected restore failures without deleting the active owner', async ({
    assert,
    cleanup,
  }) => {
    const client = env.get('DB_CLIENT')
    cleanup(async () => {
      await db.rawQuery('DROP INDEX IF EXISTS lifecycle_parents_active_label_unique')
      if (client === 'pg') {
        await db.rawQuery('DROP TRIGGER IF EXISTS lifecycle_restore_failure ON lifecycle_parents')
        await db.rawQuery('DROP FUNCTION IF EXISTS lifecycle_restore_failure_fn()')
      } else {
        await db.rawQuery('DROP TRIGGER IF EXISTS lifecycle_restore_failure')
      }
    })

    if (client === 'pg') {
      await db.rawQuery(`
        CREATE FUNCTION lifecycle_restore_failure_fn() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            RAISE EXCEPTION 'restore sentinel' USING ERRCODE = 'P0001';
          END IF;
          RETURN NEW;
        END;
        $$
      `)
      await db.rawQuery(`
        CREATE TRIGGER lifecycle_restore_failure
        BEFORE UPDATE OF deleted_at ON lifecycle_parents
        FOR EACH ROW EXECUTE FUNCTION lifecycle_restore_failure_fn()
      `)
    } else {
      await db.rawQuery(`
        CREATE TRIGGER lifecycle_restore_failure
        BEFORE UPDATE OF deleted_at ON lifecycle_parents
        WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
        BEGIN
          SELECT RAISE(ABORT, 'restore sentinel');
        END
      `)
    }

    let restoreError: unknown
    try {
      await restoreAfterUniqueConflict()
    } catch (error) {
      restoreError = error
    }

    assert.isNotNull(restoreError)
    const databaseError = restoreError as { code?: unknown; message?: unknown }
    assert.equal(
      databaseError.message && String(databaseError.message).includes('restore sentinel'),
      true
    )
    assert.equal(databaseError.code, client === 'pg' ? 'P0001' : 'SQLITE_CONSTRAINT_TRIGGER')

    const rows = await db
      .from('lifecycle_parents')
      .where('label', 'like', 'unique-%')
      .select('deleted_at')
    assert.lengthOf(rows, 2)
    assert.equal(rows.filter((row) => row.deleted_at === null).length, 1)
    assert.equal(rows.filter((row) => row.deleted_at !== null).length, 1)
  })

  test('propagates a SQLite unique violation on a similarly named column', async ({
    assert,
    cleanup,
  }) => {
    const client = env.get('DB_CLIENT')
    if (client !== 'better-sqlite3') return

    cleanup(async () => {
      await db.rawQuery('DROP TRIGGER IF EXISTS lifecycle_restore_label_other')
      await db.rawQuery('DROP INDEX IF EXISTS lifecycle_parents_active_label_other_unique')
      await db.rawQuery('ALTER TABLE lifecycle_parents DROP COLUMN label_other')
    })

    await db.rawQuery('ALTER TABLE lifecycle_parents ADD COLUMN label_other TEXT')
    await db.rawQuery(`
      CREATE UNIQUE INDEX lifecycle_parents_active_label_other_unique
      ON lifecycle_parents (label_other)
      WHERE deleted_at IS NULL
    `)
    await db.rawQuery(`
      CREATE TRIGGER lifecycle_restore_label_other
      AFTER INSERT ON lifecycle_parents
      WHEN NEW.label LIKE 'unique-%'
      BEGIN
        UPDATE lifecycle_parents SET label_other = 'same' WHERE id = NEW.id;
      END
    `)

    let restoreError: unknown
    try {
      await restoreAfterUniqueConflict()
    } catch (error) {
      restoreError = error
    }

    assert.isNotNull(restoreError)
    const databaseError = restoreError as { code?: unknown; message?: unknown }
    assert.equal(databaseError.code, 'SQLITE_CONSTRAINT_UNIQUE')
    assert.equal(
      typeof databaseError.message === 'string' &&
        databaseError.message.includes('UNIQUE constraint failed: lifecycle_parents.label_other'),
      true
    )

    const rows = await db
      .from('lifecycle_parents')
      .where('label', 'like', 'unique-%')
      .select('id', 'deleted_at')
      .orderBy('id', 'asc')
    assert.lengthOf(rows, 2)
    assert.isNotNull(rows[0].deleted_at, `Earlier row ${rows[0].id} should remain trashed`)
    assert.isNull(rows[1].deleted_at, `Active owner ${rows[1].id} should be preserved`)
  })

  test('does not recover when restore succeeds without changing the row', async ({
    assert,
    cleanup,
  }) => {
    const client = env.get('DB_CLIENT')
    cleanup(async () => {
      await db.rawQuery('DROP INDEX IF EXISTS lifecycle_parents_active_label_unique')
      if (client === 'pg') {
        await db.rawQuery('DROP TRIGGER IF EXISTS lifecycle_restore_noop ON lifecycle_parents')
        await db.rawQuery('DROP FUNCTION IF EXISTS lifecycle_restore_noop_fn()')
      } else {
        await db.rawQuery('DROP TRIGGER IF EXISTS lifecycle_restore_noop')
      }
    })

    if (client === 'pg') {
      await db.rawQuery(`
        CREATE FUNCTION lifecycle_restore_noop_fn() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            RETURN NULL;
          END IF;
          RETURN NEW;
        END;
        $$
      `)
      await db.rawQuery(`
        CREATE TRIGGER lifecycle_restore_noop
        BEFORE UPDATE OF deleted_at ON lifecycle_parents
        FOR EACH ROW EXECUTE FUNCTION lifecycle_restore_noop_fn()
      `)
    } else {
      await db.rawQuery(`
        CREATE TRIGGER lifecycle_restore_noop
        BEFORE UPDATE OF deleted_at ON lifecycle_parents
        WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
        BEGIN
          SELECT RAISE(IGNORE);
        END
      `)
    }

    const result = await restoreAfterUniqueConflict()
    assert.isFalse(result.conflictObserved)
    assert.isTrue(result.remainsTrashedAfterConflict)
    assert.isFalse(result.restoredAfterConflictWasResolved)

    const rows = await db
      .from('lifecycle_parents')
      .where('label', 'like', 'unique-%')
      .select('deleted_at')
    assert.lengthOf(rows, 2)
    assert.equal(rows.filter((row) => row.deleted_at === null).length, 1)
    assert.equal(rows.filter((row) => row.deleted_at !== null).length, 1)
  })

  test('maps the deletion attribute to a custom column and serializes UTC ISO', async ({
    assert,
  }) => {
    const { serialized, deletedAtIsLuxon, customColumnWritten, defaultDeletedColumnIsNull } =
      await customDeletionColumnWithUtcSerialization()
    assert.isTrue(deletedAtIsLuxon)
    assert.isTrue(customColumnWritten)
    assert.isTrue(defaultDeletedColumnIsNull)
    assert.equal(serialized.deletedAt, '2026-02-02T22:35:06.000Z')
  })
})
