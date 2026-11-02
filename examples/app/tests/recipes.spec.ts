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

  test('preserves operation and cleanup failures from the restore recipe', async ({
    assert,
    cleanup,
  }) => {
    const client = env.get('DB_CLIENT')
    cleanup(async () => {
      await db.rawQuery('DROP INDEX IF EXISTS lifecycle_parents_active_label_unique')
      if (client === 'pg') {
        await db.rawQuery(
          'DROP TRIGGER IF EXISTS lifecycle_restore_cleanup_failure ON lifecycle_parents'
        )
        await db.rawQuery('DROP FUNCTION IF EXISTS lifecycle_restore_cleanup_failure_fn()')
      } else {
        await db.rawQuery('DROP TRIGGER IF EXISTS lifecycle_restore_cleanup_failure')
      }
    })

    const originalRawQueryDescriptor = Object.getOwnPropertyDescriptor(db, 'rawQuery')
    const rawQuery = db.rawQuery.bind(db)
    const cleanupFailure = new Error('temporary index cleanup sentinel')
    const rawQueryWithCleanupFailure = (...args: Parameters<typeof db.rawQuery>) => {
      const query = String(args[0])
      return rawQuery(...args).then((result) => {
        if (query.includes('DROP INDEX IF EXISTS lifecycle_parents_active_label_unique')) {
          throw cleanupFailure
        }
        return result
      })
    }
    Object.defineProperty(db, 'rawQuery', {
      configurable: true,
      value: rawQueryWithCleanupFailure,
    })

    try {
      let cleanupOnlyError: unknown
      try {
        await restoreAfterUniqueConflict()
      } catch (error) {
        cleanupOnlyError = error
      }
      assert.equal(cleanupOnlyError, cleanupFailure)

      if (client === 'pg') {
        await db.rawQuery(`
          CREATE FUNCTION lifecycle_restore_cleanup_failure_fn() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
              RAISE EXCEPTION 'restore operation sentinel' USING ERRCODE = 'P0001';
            END IF;
            RETURN NEW;
          END;
          $$
        `)
        await db.rawQuery(`
          CREATE TRIGGER lifecycle_restore_cleanup_failure
          BEFORE UPDATE OF deleted_at ON lifecycle_parents
          FOR EACH ROW EXECUTE FUNCTION lifecycle_restore_cleanup_failure_fn()
        `)
      } else {
        await db.rawQuery(`
          CREATE TRIGGER lifecycle_restore_cleanup_failure
          BEFORE UPDATE OF deleted_at ON lifecycle_parents
          WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
          BEGIN
            SELECT RAISE(ABORT, 'restore operation sentinel');
          END
        `)
      }

      let dualFailure: unknown
      try {
        await restoreAfterUniqueConflict()
      } catch (error) {
        dualFailure = error
      }

      assert.instanceOf(dualFailure, AggregateError)
      const errors = (dualFailure as AggregateError).errors
      assert.lengthOf(errors, 2)
      const operationError = errors[0] as { code?: unknown; message?: unknown }
      assert.equal(
        typeof operationError.message === 'string' &&
          operationError.message.includes('restore operation sentinel'),
        true
      )
      assert.equal(operationError.code, client === 'pg' ? 'P0001' : 'SQLITE_CONSTRAINT_TRIGGER')
      assert.equal(errors[1], cleanupFailure)
    } finally {
      if (originalRawQueryDescriptor) {
        Object.defineProperty(db, 'rawQuery', originalRawQueryDescriptor)
      } else {
        Reflect.deleteProperty(db, 'rawQuery')
      }
    }
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
    cleanup(async () => {
      await db.rawQuery('DROP TRIGGER IF EXISTS lifecycle_seed_label_other')
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
    await db.table('lifecycle_parents').insert({
      tenant_id: 1,
      label: 'unrelated-owner',
      deleted_at: null,
      label_other: 'third',
    })
    await db.rawQuery(`
      CREATE TRIGGER lifecycle_seed_label_other
      AFTER INSERT ON lifecycle_parents
      WHEN NEW.label LIKE 'unique-%'
      BEGIN
        UPDATE lifecycle_parents
        SET label_other = CASE
          WHEN EXISTS (
            SELECT 1 FROM lifecycle_parents
            WHERE label = NEW.label AND id <> NEW.id
          ) THEN 'owner'
          ELSE 'deleted'
        END
        WHERE id = NEW.id;
      END
    `)
    await db.rawQuery(`
      CREATE TRIGGER lifecycle_restore_label_other
      BEFORE UPDATE OF deleted_at ON lifecycle_parents
      WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
      BEGIN
        UPDATE lifecycle_parents SET label_other = 'third'
        WHERE label = NEW.label AND deleted_at IS NULL;
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
      .select('id', 'deleted_at', 'label_other')
      .orderBy('id', 'asc')
    assert.lengthOf(rows, 2)
    assert.isNotNull(rows[0].deleted_at, `Earlier row ${rows[0].id} should remain trashed`)
    assert.isNull(rows[1].deleted_at, `Active owner ${rows[1].id} should be preserved`)
    assert.equal(rows[1].label_other, 'owner')
    const thirdOwner = await db
      .from('lifecycle_parents')
      .where('label', 'unrelated-owner')
      .firstOrFail()
    assert.equal(thirdOwner.label_other, 'third')
    assert.isNull(thirdOwner.deleted_at)
  }).skip(env.get('DB_CLIENT') !== 'better-sqlite3', 'SQLite trigger-based unique violation test')

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
