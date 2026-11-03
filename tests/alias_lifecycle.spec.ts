/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { extendModelQueryBuilder } from '../src/bindings/model_query_builder.js'
import { createDatabase, createTables } from './helpers.js'
import { RelationUser } from './fixtures/models.js'

test.group('Punctuation alias lifecycle writes', (group) => {
  group.setup(() => extendModelQueryBuilder(ModelQueryBuilder))

  test('receipt writes select and change only the aliased row in a caller transaction', async ({
    assert,
    cleanup,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const selected = await RelationUser.create({ username: 'alias-selected' })
    const unselected = await RelationUser.create({ username: 'alias-unselected' })
    const trx = await db.transaction()
    cleanup(async () => {
      if (!trx.isCompleted) await trx.rollback()
    })

    const query = (objectAlias = false) => {
      const builder = RelationUser.query({ client: trx })
      if (objectAlias) builder.from({ 'user.rows': 'users' })
      else builder.from('users as user.rows')
      return builder.where('id', selected.id)
    }

    const deleted = await query(true).softDelete({ receipt: true })
    assert.equal(deleted.count, 1)
    assert.deepEqual(deleted.ids, [selected.id])
    assert.isNotNull(deleted.deletedAt)
    const selectedAfterDelete = await trx.from('users').where('id', selected.id).firstOrFail()
    const unselectedAfterDelete = await trx.from('users').where('id', unselected.id).firstOrFail()
    assert.isNotNull(selectedAfterDelete.deleted_at)
    assert.isNull(unselectedAfterDelete.deleted_at)

    const restored = await query().restore({ receipt: true })
    assert.equal(restored.count, 1)
    assert.deepEqual(restored.ids, [selected.id])
    const selectedAfterRestore = await trx.from('users').where('id', selected.id).firstOrFail()
    const unselectedAfterRestore = await trx.from('users').where('id', unselected.id).firstOrFail()
    assert.isNull(selectedAfterRestore.deleted_at)
    assert.isNull(unselectedAfterRestore.deleted_at)

    await query().softDelete()
    const deletedAgain = await query(true).onlyTrashed().forceDelete({ receipt: true })
    assert.equal(deletedAgain.count, 1)
    assert.deepEqual(deletedAgain.ids, [selected.id])
    assert.isNull(await trx.from('users').where('id', selected.id).first())
    assert.isNotNull(await trx.from('users').where('id', unselected.id).first())
    await trx.rollback()
  })
})
