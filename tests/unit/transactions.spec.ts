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
import { createDatabase, createTables, dbClient } from '../helpers.js'
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

          const originalBefore = { ...instance.$original }
          if (outcome === 'rollback') instance.email = 'dirty@example.test'
          if (action === 'delete') await instance.delete()
          if (action === 'restore') await instance.restore()
          if (action === 'forceDelete') await instance.forceDelete()

          const memoryAfterWrite = {
            deletedAt: instance.deletedAt,
            dirty: { ...instance.$dirty },
            original: { ...instance.$original },
            isDeleted: instance.$isDeleted,
            forceDelete: instance.$forceDelete,
          }
          if (outcome === 'commit') await transaction.commit()
          else {
            await transaction.rollback()
            assert.strictEqual(instance.deletedAt, memoryAfterWrite.deletedAt)
            assert.deepEqual(instance.$dirty, memoryAfterWrite.dirty)
            assert.deepEqual(instance.$original, memoryAfterWrite.original)
            assert.equal(instance.$isDeleted, action === 'forceDelete')
            assert.isFalse(instance.$forceDelete)
            if (action === 'forceDelete') {
              assert.deepEqual(instance.$original, originalBefore)
              assert.deepEqual(instance.$dirty, { email: 'dirty@example.test' })
              await assert.rejects(() => instance.refresh())
            } else {
              assert.equal(instance.trashed, action === 'delete')
              assert.deepEqual(instance.$dirty, {})
              assert.equal(instance.$original.email, 'dirty@example.test')
            }
          }

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
          if (outcome === 'rollback') {
            assert.equal(after!.email, user.email)
          }
        })
      }
    }
  }

  for (const outcome of outcomes) {
    test(`deleteQuietly through a caller transaction and ${outcome}`, async ({ assert }) => {
      const db = await createDatabase()
      await createTables(db)
      const user = await createUser(`quiet-${outcome}`)
      const transaction = await db.transaction()
      user.useTransaction(transaction)
      user.email = 'quiet-dirty@example.test'
      await user.deleteQuietly()
      const timestamp = user.deletedAt
      const original = { ...user.$original }
      assert.isTrue(user.trashed)
      assert.deepEqual(user.$dirty, {})
      assert.isFalse(user.$isDeleted)
      assert.isFalse(user.$forceDelete)
      await transaction[outcome]()
      assert.strictEqual(user.deletedAt, timestamp)
      assert.deepEqual(user.$original, original)
      assert.deepEqual(user.$dirty, {})
      assert.isFalse(user.$isDeleted)
      assert.isFalse(user.$forceDelete)
      const fetched = await RelationUser.withTrashed().where('id', user.id).firstOrFail()
      assert.equal(fetched.trashed, outcome === 'commit')
      assert.equal(
        fetched.email,
        outcome === 'commit' ? 'quiet-dirty@example.test' : `quiet-${outcome}@example.test`
      )
    })
  }

  test('caller policy and bookkeeping share the mutation transaction', async ({
    assert,
    cleanup,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    await db.connection().schema.createTable('operation_notes', (table) => {
      table.increments()
      table.integer('user_id')
      table.string('message')
    })
    cleanup(async () => {
      await db.connection().schema.dropTableIfExists('operation_notes')
    })
    const user = await createUser('composition')
    async function remove(allowed: boolean, failAfterWrite: boolean) {
      await db.transaction(async (transaction) => {
        if (!allowed) throw new Error('policy rejected')
        const record = await RelationUser.query({ client: transaction })
          .where('id', user.id)
          .firstOrFail()
        await record.delete()
        await transaction
          .table('operation_notes')
          .insert({ user_id: record.id, message: 'removed' })
        if (failAfterWrite) throw new Error('bookkeeping rejected')
      })
    }
    await assert.rejects(() => remove(true, true), 'bookkeeping rejected')
    assert.isNotNull(await RelationUser.find(user.id))
    assert.deepEqual(await db.from('operation_notes'), [])
    await assert.rejects(() => remove(false, false), 'policy rejected')
    assert.isNotNull(await RelationUser.find(user.id))
    assert.deepEqual(await db.from('operation_notes'), [])
    await remove(true, false)
    assert.isNull(await RelationUser.find(user.id))
    const notes = await db.from('operation_notes')
    assert.lengthOf(notes, 1)
    assert.equal(notes[0].user_id, user.id)
  })

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
    if (dbClient === 'pg') {
      await db.rawQuery('DROP SCHEMA IF EXISTS second CASCADE').exec()
      await db.rawQuery('CREATE SCHEMA second').exec()
      ;(secondaryConfig as PostgreConfig).searchPath = ['second']
    } else if (dbClient === 'mysql') {
      await db.rawQuery('DROP DATABASE IF EXISTS lucid_soft_deletes_second').exec()
      await db.rawQuery('CREATE DATABASE lucid_soft_deletes_second').exec()
      const mysqlConfig = secondaryConfig as { connection: { database?: string } }
      mysqlConfig.connection = { ...mysqlConfig.connection, database: 'lucid_soft_deletes_second' }
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
    await deletedOnSecondary.restore()
    assert.isNotNull(
      await RelationUser.query({ client: secondary }).where('id', fromSecondary.id).first()
    )
    await deletedOnSecondary.delete()
    assert.equal(
      await RelationUser.query({ client: secondary }).where('id', fromSecondary.id).restore(),
      1
    )
    const restoredOnSecondary = await RelationUser.query({ client: secondary })
      .where('id', fromSecondary.id)
      .firstOrFail()
    await restoredOnSecondary.forceDelete()
    assert.isNull(
      await RelationUser.query({ client: secondary })
        .withTrashed()
        .where('id', fromSecondary.id)
        .first()
    )
    assert.deepEqual(await db.from('users'), [])

    await secondary.table('users').insert({
      username: 'secondary-macros',
      email: 'secondary-macros@example.test',
    })
    assert.equal(await RelationUser.query({ client: secondary }).softDelete(), 1)
    assert.equal(await RelationUser.query({ client: secondary }).restore(), 1)
    assert.equal(await RelationUser.query({ client: secondary }).softDelete(), 1)
    assert.equal(await RelationUser.query({ client: secondary }).onlyTrashed().forceDelete(), 1)
    assert.lengthOf(await secondary.from('users'), 0)
    assert.lengthOf(await db.from('users'), 0)

    if (dbClient === 'pg') {
      await db.rawQuery('DROP SCHEMA second CASCADE').exec()
    } else if (dbClient === 'mysql') {
      await db.rawQuery('DROP DATABASE lucid_soft_deletes_second').exec()
    }
  })
})
