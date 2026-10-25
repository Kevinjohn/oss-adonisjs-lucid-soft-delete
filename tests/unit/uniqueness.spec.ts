/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { getActiveTest, test } from '@japa/runner'
import { SoftDeletes } from '../../src/mixin.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'
import { createDatabase } from '../helpers.js'

class ReusableRecord extends compose(BaseModel, SoftDeletes) {
  static table = 'unique_records_reuse'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare code: string
}

class RestorableRecord extends compose(BaseModel, SoftDeletes) {
  static table = 'unique_records_restore'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare code: string
}

async function createPartialUniqueTable(
  db: Awaited<ReturnType<typeof createDatabase>>,
  tableName: string
) {
  const activeTest = getActiveTest()
  if (!activeTest) throw new Error('Cannot use createPartialUniqueTable outside of a Japa test')

  activeTest.cleanup(async () => {
    await db.connection().schema.dropTableIfExists(tableName)
  })

  await db.connection().schema.createTable(tableName, (table) => {
    table.increments()
    table.string('code').notNullable()
    table.timestamp('deleted_at', { useTz: true })
  })
  await db.rawQuery(
    `CREATE UNIQUE INDEX ${tableName}_active_code_unique ON ${tableName} (code) WHERE deleted_at IS NULL`
  )
}

test.group('PostgreSQL partial unique indexes', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('allows reusing a value after its row is soft-deleted', async ({ assert }) => {
    const db = await createDatabase()
    await createPartialUniqueTable(db, ReusableRecord.table)

    const previous = new ReusableRecord()
    previous.code = 'reusable'
    await previous.save()
    await previous.delete()

    const replacement = new ReusableRecord()
    replacement.code = 'reusable'
    await replacement.save()

    assert.notEqual(replacement.id, previous.id)
    assert.isFalse(replacement.trashed)
  }).skip(process.env.DB_CLIENT !== 'pg', 'PostgreSQL partial unique index test')

  test('rejects restoring a row when a newer active row uses its value', async ({ assert }) => {
    const db = await createDatabase()
    await createPartialUniqueTable(db, RestorableRecord.table)

    const previous = new RestorableRecord()
    previous.code = 'reusable'
    await previous.save()
    await previous.delete()

    const replacement = new RestorableRecord()
    replacement.code = 'reusable'
    await replacement.save()

    let restoreError: { code?: string } | undefined
    try {
      await previous.restore()
    } catch (error) {
      restoreError = error as { code?: string }
    }
    assert.equal(restoreError?.code, '23505')
    assert.isTrue(previous.trashed)

    const active = await RestorableRecord.findOrFail(replacement.id)
    const trashed = await RestorableRecord.withTrashed().where('id', previous.id).firstOrFail()
    assert.equal(active.code, 'reusable')
    assert.isFalse(active.trashed)
    assert.isTrue(trashed.trashed)

    await replacement.delete()
    await previous.restore()

    assert.isFalse(previous.trashed)
    const restored = await RestorableRecord.findOrFail(previous.id)
    assert.equal(restored.id, previous.id)
    assert.isNull(await RestorableRecord.find(replacement.id))
  }).skip(process.env.DB_CLIENT !== 'pg', 'PostgreSQL partial unique index test')
})
