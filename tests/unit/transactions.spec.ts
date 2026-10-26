/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import type {
  PostgreConfig,
  SqliteConfig,
  TransactionClientContract,
} from '@adonisjs/lucid/types/database'
import { dirname, join } from 'node:path'
import { createDatabase, createTables } from '../helpers.js'
import { RelationPost, RelationUser } from '../fixtures/models.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'

async function createUser(username: string) {
  const user = new RelationUser()
  user.fill({ username, email: `${username}@example.test`, managerId: null })
  await user.save()
  return user
}

test.group('Soft-delete transactions', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  const actions = ['delete', 'restore', 'forceDelete'] as const
  const attachments = ['useTransaction', 'queryClient'] as const
  const outcomes = ['commit', 'rollback'] as const

  for (const action of actions) {
    for (const attachment of attachments) {
      for (const outcome of outcomes) {
        test(`${action} through ${attachment} and ${outcome}`, async ({ assert }) => {
          const db = await createDatabase()
          await createTables(db)
          const user = await createUser(`${action}-${attachment}-${outcome}`)
          if (action === 'restore') await user.delete()

          const sourceQuery =
            action === 'restore' ? RelationUser.withTrashed() : RelationUser.query()
          let instance: RelationUser
          let transaction: TransactionClientContract

          if (attachment === 'queryClient') {
            transaction = await db.transaction()
            instance = (await RelationUser.query({ client: transaction })
              .if(action === 'restore', (query) => query.withTrashed())
              .where('id', user.id)
              .firstOrFail()) as RelationUser
          } else {
            instance = (await sourceQuery.where('id', user.id).firstOrFail()) as RelationUser
            transaction = await db.transaction()
            instance.useTransaction(transaction)
          }

          if (action === 'delete') await instance.delete()
          if (action === 'restore') await instance.restore()
          if (action === 'forceDelete') await instance.forceDelete()

          if (outcome === 'commit') await transaction.commit()
          else await transaction.rollback()

          const after = (await RelationUser.withTrashed()
            .where('id', user.id)
            .first()) as RelationUser | null

          if (action === 'forceDelete') {
            assert.equal(after === null, outcome === 'commit')
          } else {
            assert.isNotNull(after)
            const shouldBeTrashed =
              action === 'delete' ? outcome === 'commit' : outcome === 'rollback'
            assert.equal(after!.trashed, shouldBeTrashed)
          }
        })
      }
    }
  }

  test('related model queries can execute on a transaction client', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const user = await createUser('relation-transaction')
    const transaction = await db.transaction()

    const post = new RelationPost()
    post.fill({ userId: user.id, title: 'Created inside transaction' })
    post.useTransaction(transaction)
    await post.save()

    const posts = await user.related('posts').query().useTransaction(transaction)
    assert.deepEqual(
      posts.map((row) => row.id),
      [post.id]
    )

    await transaction.rollback()
    assert.lengthOf(await RelationPost.query(), 0)
  })

  test('models can query through a second named connection', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const primaryConfig = db.config.connections[db.primaryConnectionName]
    if (!primaryConfig) throw new Error('Primary database connection is missing')

    let secondaryConfig = structuredClone(primaryConfig)
    if (process.env.DB_CLIENT === 'pg') {
      await db.rawQuery('DROP SCHEMA IF EXISTS second CASCADE').exec()
      await db.rawQuery('CREATE SCHEMA second').exec()
      ;(secondaryConfig as PostgreConfig).searchPath = ['second']
    } else {
      const sqliteConfig = secondaryConfig as SqliteConfig
      if (typeof sqliteConfig.connection === 'string') {
        throw new Error('Expected SQLite connection options')
      }
      sqliteConfig.connection.filename = join(
        dirname(sqliteConfig.connection.filename),
        'secondary.sqlite3'
      )
    }

    db.manager.add('secondary', secondaryConfig)
    db.manager.connect('secondary')

    const secondary = db.connection('secondary')
    await secondary.schema.createTable('users', (table) => {
      table.increments()
      table.string('username')
      table.string('email')
      table.integer('manager_id')
      table.timestamp('deleted_at', { useTz: true })
      table.timestamps()
    })
    await secondary.table('users').insert({
      username: 'secondary-only',
      email: 'secondary-only@example.test',
      manager_id: null,
      deleted_at: null,
    })

    const fromSecondary = (await RelationUser.query({ client: secondary })
      .where('username', 'secondary-only')
      .firstOrFail()) as RelationUser
    const fromPrimary = await RelationUser.query().where('username', 'secondary-only').first()

    assert.equal(fromSecondary.username, 'secondary-only')
    assert.isNull(fromPrimary)
    assert.equal(db.manager.has('secondary'), true)

    fromSecondary.useConnection('secondary')
    await fromSecondary.delete()
    const deletedOnSecondary = (await RelationUser.query({ client: secondary })
      .withTrashed()
      .where('username', 'secondary-only')
      .firstOrFail()) as RelationUser
    assert.isTrue(deletedOnSecondary.trashed)

    if (process.env.DB_CLIENT === 'pg') {
      await db.rawQuery('DROP SCHEMA second CASCADE').exec()
    }
  })
})
