/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { compose } from '@adonisjs/core/helpers'
import {
  afterDelete,
  afterSave,
  afterUpdate,
  BaseModel,
  beforeDelete,
  beforeSave,
  beforeUpdate,
  column,
  ModelQueryBuilder,
} from '@adonisjs/lucid/orm'
import { getActiveTest, test } from '@japa/runner'
import { DateTime } from 'luxon'
import { SoftDeletes } from '../../src/mixin.js'
import { E_MODEL_NOT_PERSISTED } from '../../src/errors.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'
import { createDatabase, createTables } from '../helpers.js'

class LifecycleRecord extends compose(BaseModel, SoftDeletes) {
  static table = 'users'
  static events: string[] = []
  static failOn:
    'beforeSave' | 'beforeDelete' | 'afterUpdate' | 'afterSave' | 'afterDelete' | null = null
  static shiftDeletedAt = false

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare username: string

  @column()
  declare email: string

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeDelete()
  static recordBeforeDelete(_record: LifecycleRecord) {
    this.events.push('beforeDelete')
    if (this.failOn === 'beforeDelete') throw new Error('beforeDelete failed')
  }

  @beforeUpdate()
  static recordBeforeUpdate(record: LifecycleRecord) {
    this.events.push('beforeUpdate')
    if (this.shiftDeletedAt && record.deletedAt) {
      record.deletedAt = record.deletedAt.minus({ minutes: 1 })
    }
  }

  @beforeSave()
  static recordBeforeSave(_record: LifecycleRecord) {
    this.events.push('beforeSave')
    if (this.failOn === 'beforeSave') throw new Error('beforeSave failed')
  }

  @afterUpdate()
  static recordAfterUpdate(_record: LifecycleRecord) {
    this.events.push('afterUpdate')
    if (this.failOn === 'afterUpdate') throw new Error('afterUpdate failed')
  }

  @afterSave()
  static recordAfterSave(_record: LifecycleRecord) {
    this.events.push('afterSave')
    if (this.failOn === 'afterSave') throw new Error('afterSave failed')
  }

  @afterDelete()
  static recordAfterDelete(_record: LifecycleRecord) {
    this.events.push('afterDelete')
    if (this.failOn === 'afterDelete') throw new Error('afterDelete failed')
  }
}

async function seedRecord(username = 'lifecycle') {
  const record = new LifecycleRecord()
  record.fill({ username, email: `${username}@example.test` })
  await record.save()
  LifecycleRecord.events = []
  return record
}

test.group('Soft-delete lifecycle', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  group.each.setup(() => {
    LifecycleRecord.events = []
    LifecycleRecord.failOn = null
    LifecycleRecord.shiftDeletedAt = false
  })

  test('soft delete persists dirty attributes and runs hooks in Lucid order', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord()
    record.username = 'updated-during-delete'

    await record.delete()

    assert.deepEqual(LifecycleRecord.events, [
      'beforeDelete',
      'beforeUpdate',
      'beforeSave',
      'afterUpdate',
      'afterSave',
      'afterDelete',
    ])
    assert.isFalse(record.$isDeleted)
    assert.isTrue(record.trashed)
    assert.isFalse(record.$isDirty)

    const stored = (await LifecycleRecord.withTrashed()
      .where('id', record.id)
      .firstOrFail()) as LifecycleRecord
    assert.equal(stored.username, 'updated-during-delete')
  })

  test('sets deletion time from the local clock and advances updatedAt', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord()
    const oldUpdatedAt = DateTime.local().minus({ hours: 1 })
    await db.from('users').where('id', record.id).update({ updated_at: oldUpdatedAt.toISO() })
    await record.refresh()
    LifecycleRecord.events = []

    const deleteStartedAt = DateTime.local()
    await record.delete()
    const deleteFinishedAt = DateTime.local()

    assert.isTrue(record.deletedAt!.toMillis() >= deleteStartedAt.toMillis())
    assert.isTrue(record.deletedAt!.toMillis() <= deleteFinishedAt.toMillis())
    assert.isTrue(record.updatedAt.toMillis() > oldUpdatedAt.toMillis())
  })

  test('a repeated delete on a persisted trashed model does no work', async ({ assert }) => {
    const db = await createDatabase((event) => {
      if (event.sql.toLowerCase().startsWith('update')) LifecycleRecord.events.push('query:update')
    })
    await createTables(db)
    const record = await seedRecord()
    await record.delete()
    LifecycleRecord.events = []

    await record.delete()

    assert.deepEqual(LifecycleRecord.events, [])
  })

  test('reverts deletedAt when a soft-delete save hook fails', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord()
    const previousDeletedAt = record.deletedAt
    LifecycleRecord.failOn = 'beforeSave'

    await assert.rejects(() => record.delete(), 'beforeSave failed')

    assert.equal(record.deletedAt, previousDeletedAt)
    assert.isFalse(record.$isDeleted)
    assert.isFalse(record.$isDirty)
    const stored = await LifecycleRecord.query().where('id', record.id).firstOrFail()
    assert.isNull(stored.deletedAt)
  })

  test('retains persisted deletion state when a post-write hook fails', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    for (const hook of ['afterUpdate', 'afterSave'] as const) {
      const record = await seedRecord(`post-write-${hook}`)
      LifecycleRecord.failOn = hook

      await assert.rejects(() => record.delete(), `${hook} failed`)

      assert.isTrue(record.trashed)
      assert.isFalse(record.$isDirty)
      const stored = (await LifecycleRecord.withTrashed()
        .where('id', record.id)
        .firstOrFail()) as LifecycleRecord
      assert.isTrue(stored.trashed)

      LifecycleRecord.failOn = null
      record.username = `saved-after-${hook}`
      await record.save()
      const saved = (await LifecycleRecord.withTrashed()
        .where('id', record.id)
        .firstOrFail()) as LifecycleRecord
      assert.isTrue(saved.trashed)
      assert.equal(saved.username, `saved-after-${hook}`)
    }
  })

  test('keeps a hook-adjusted persisted timestamp after a post-write failure', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord('hook-adjusted-timestamp')
    LifecycleRecord.shiftDeletedAt = true
    LifecycleRecord.failOn = 'afterSave'

    await assert.rejects(() => record.delete(), 'afterSave failed')

    const stored = (await LifecycleRecord.withTrashed()
      .where('id', record.id)
      .firstOrFail()) as LifecycleRecord
    assert.isTrue(record.trashed)
    assert.equal(
      Math.floor(record.deletedAt!.toMillis() / 1000),
      Math.floor(stored.deletedAt!.toMillis() / 1000)
    )

    LifecycleRecord.shiftDeletedAt = false
    LifecycleRecord.failOn = null
    record.username = 'saved-after-hook-adjustment'
    await record.save()
    const saved = (await LifecycleRecord.withTrashed()
      .where('id', record.id)
      .firstOrFail()) as LifecycleRecord
    assert.isTrue(saved.trashed)
  })

  test('keeps a failed restore retryable on the same instance', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord('restore-retry')
    await record.delete()
    const previousDeletedAt = record.deletedAt
    LifecycleRecord.failOn = 'beforeSave'

    await assert.rejects(() => record.restore(), 'beforeSave failed')

    assert.equal(record.deletedAt, previousDeletedAt)
    assert.isTrue(record.trashed)
    const stored = (await LifecycleRecord.withTrashed()
      .where('id', record.id)
      .firstOrFail()) as LifecycleRecord
    assert.isTrue(stored.trashed)

    LifecycleRecord.failOn = null
    await record.restore()
    assert.isFalse(record.trashed)
  })

  test('retains the restored state when a post-write hook fails', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    for (const hook of ['afterUpdate', 'afterSave'] as const) {
      const record = await seedRecord(`restore-post-write-${hook}`)
      await record.delete()
      LifecycleRecord.failOn = hook

      await assert.rejects(() => record.restore(), `${hook} failed`)

      assert.isFalse(record.trashed)
      assert.isFalse(record.$isDirty)
      const stored = (await LifecycleRecord.findOrFail(record.id)) as LifecycleRecord
      assert.isFalse(stored.trashed)

      LifecycleRecord.failOn = null
      record.username = `saved-after-restore-${hook}`
      await record.save()
      const saved = (await LifecycleRecord.findOrFail(record.id)) as LifecycleRecord
      assert.isFalse(saved.trashed)
      assert.equal(saved.username, `saved-after-restore-${hook}`)
    }
  })

  test('recovers the force-delete flag when beforeDelete throws', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord()
    LifecycleRecord.failOn = 'beforeDelete'

    await assert.rejects(() => record.forceDelete(), 'beforeDelete failed')

    assert.isFalse(record.$forceDelete)
    assert.isFalse(record.$isDeleted)
    assert.isFalse(record.trashed)
    LifecycleRecord.failOn = null
    await record.delete()
    assert.isTrue(record.trashed)
  })

  test('keeps the force-delete flag clear when a database foreign key rejects deletion', async ({
    assert,
  }) => {
    const db = await createDatabase()
    const activeTest = getActiveTest()
    activeTest?.cleanup(async () => {
      await db.connection().schema.dropTableIfExists('lifecycle_children')
    })
    await createTables(db)
    const schema = db.connection().schema
    await schema.dropTableIfExists('lifecycle_children')
    await schema.createTable('lifecycle_children', (table) => {
      table.increments()
      table.integer('user_id').notNullable().references('users.id')
    })
    if (process.env.DB_CLIENT !== 'pg') {
      await db.connection().raw('PRAGMA foreign_keys = ON')
    }
    const record = await seedRecord()
    await db.connection().insertQuery().table('lifecycle_children').insert({ user_id: record.id })

    await assert.rejects(() => record.forceDelete())

    assert.isFalse(record.$forceDelete)
    assert.isFalse(record.$isDeleted)
    assert.isFalse(record.trashed)
    assert.equal(
      await db
        .from('users')
        .where('id', record.id)
        .count('* as total')
        .first()
        .then((row) => row?.total),
      1
    )
    assert.equal(
      await LifecycleRecord.query()
        .where('id', record.id)
        .count('* as total')
        .first()
        .then((row) => row?.$extras.total),
      1
    )
    await schema.dropTable('lifecycle_children')
    await record.delete()
    assert.isTrue(record.trashed)
  })

  test('leaves a physically deleted row marked deleted when afterDelete throws', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord()
    LifecycleRecord.failOn = 'afterDelete'

    await assert.rejects(() => record.forceDelete(), 'afterDelete failed')

    assert.isFalse(record.$forceDelete)
    assert.isTrue(record.$isDeleted)
    assert.equal(
      await db
        .from('users')
        .where('id', record.id)
        .count('* as total')
        .first()
        .then((row) => row?.total),
      0
    )
    await assert.rejects(() => record.delete(), /Cannot mutate delete model instance/)
    assert.isTrue(record.$isDeleted)
    await assert.rejects(() => record.deleteQuietly(), /Cannot mutate delete model instance/)
    assert.isTrue(record.$isDeleted)
    await assert.rejects(
      () => record.restore(),
      'Cannot restore a model instance that was force deleted'
    )
    assert.isTrue(record.$isDeleted)
  })

  test('keeps successful force-deleted instances immutable', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord()

    await record.forceDelete()

    assert.isTrue(record.$isDeleted)
    await assert.rejects(() => record.delete(), /Cannot mutate delete model instance/)
    assert.isTrue(record.$isDeleted)
    await assert.rejects(() => record.deleteQuietly(), /Cannot mutate delete model instance/)
    assert.isTrue(record.$isDeleted)
    await assert.rejects(
      () => record.restore(),
      'Cannot restore a model instance that was force deleted'
    )
    assert.isTrue(record.$isDeleted)
  })

  test('deleteQuietly soft-deletes without hooks and remains restorable', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord()

    await record.deleteQuietly()

    assert.deepEqual(LifecycleRecord.events, [])
    assert.isFalse(record.$isDeleted)
    assert.isTrue(record.trashed)
    await record.restore()
    assert.isFalse(record.trashed)
  })

  test('deleteQuietly with $forceDelete physically deletes without hooks', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord()

    record.$forceDelete = true
    await record.deleteQuietly()

    assert.deepEqual(LifecycleRecord.events, [])
    assert.isTrue(record.$isDeleted)
    assert.isNull(await db.from('users').where('id', record.id).first())
  })

  test('deleteQuietly rejects on a trashed model after forceDelete', async ({ assert }) => {
    const statements: string[] = []
    const db = await createDatabase((event) => statements.push(event.sql))
    await createTables(db)
    const record = await seedRecord()
    await record.delete()
    await record.forceDelete()
    statements.length = 0

    await assert.rejects(() => record.deleteQuietly(), /Cannot mutate delete model instance/)

    assert.deepEqual(statements, [])
    assert.isTrue(record.$isDeleted)
  })

  test('restore advances updatedAt', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord()
    await record.delete()
    const oldUpdatedAt = DateTime.local().minus({ hours: 1 })
    await db.from('users').where('id', record.id).update({ updated_at: oldUpdatedAt.toISO() })
    await record.refresh()

    await record.restore()

    assert.isFalse(record.trashed)
    assert.isTrue(record.updatedAt.toMillis() > oldUpdatedAt.toMillis())
  })

  test('saveQuietly persists dirty attributes on a trashed model without hooks', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = await seedRecord()
    await record.delete()
    LifecycleRecord.events = []
    record.username = 'quiet-update'

    await record.saveQuietly()

    assert.deepEqual(LifecycleRecord.events, [])
    const stored = (await LifecycleRecord.withTrashed()
      .where('id', record.id)
      .firstOrFail()) as LifecycleRecord
    assert.equal(stored.username, 'quiet-update')
    assert.isTrue(stored.trashed)
  })

  test('delete and deleteQuietly reject an unpersisted model without inserting', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const record = new LifecycleRecord()
    record.fill({ username: 'unsaved', email: 'unsaved@example.test' })
    assert.isFalse(record.trashed)

    const errors: unknown[] = []
    for (const operation of [() => record.delete(), () => record.deleteQuietly()]) {
      try {
        await operation()
      } catch (error) {
        errors.push(error)
      }
    }
    assert.lengthOf(errors, 2)
    for (const error of errors) {
      assert.instanceOf(error, E_MODEL_NOT_PERSISTED)
      assert.equal((error as { code: string }).code, E_MODEL_NOT_PERSISTED.code)
      assert.equal((error as { status: number }).status, E_MODEL_NOT_PERSISTED.status)
    }

    assert.equal(
      await db
        .from('users')
        .count('* as total')
        .first()
        .then((row) => row?.total),
      0
    )
  })

  test('restore on an active model returns the same instance without writing', async ({
    assert,
  }) => {
    const db = await createDatabase((event) => {
      if (event.sql.toLowerCase().startsWith('update')) LifecycleRecord.events.push('query:update')
    })
    await createTables(db)
    const record = await seedRecord()
    LifecycleRecord.events = []

    const restored = await record.restore()

    assert.strictEqual(restored, record)
    assert.deepEqual(LifecycleRecord.events, [])
  })
})
