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
import { test } from '@japa/runner'
import type { DateTime } from 'luxon'
import { DateTime as LuxonDateTime } from 'luxon'
import { SoftDeletes } from '../../index.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'
import { createDatabase, createTables } from '../helpers.js'
import { RelationUser } from '../fixtures/models.js'

class CustomPost extends compose(BaseModel, SoftDeletes) {
  static table = 'posts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column.dateTime({ columnName: 'deletedAt' })
  declare deletedAt: DateTime | null
}

async function createUser(username: string, trashed = false) {
  const user = new RelationUser()
  user.fill({ username, email: `${username}@example.test`, managerId: null })
  await user.save()
  if (trashed) await user.delete()
  return user
}

async function restoreAndGetCount(query: unknown): Promise<number> {
  return await (query as { restore(): Promise<number> }).restore()
}

test.group('Builder restore', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('restores only matching trashed rows and returns zero, one, and many counts', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    const active = await createUser('active')
    const trashedOne = await createUser('one', true)
    const trashedManyA = await createUser('many-a', true)
    const trashedManyB = await createUser('many-b', true)

    assert.equal(await restoreAndGetCount(RelationUser.query().where('id', -1)), 0)
    assert.equal(await restoreAndGetCount(RelationUser.query().where('id', trashedOne.id)), 1)
    assert.equal(
      await restoreAndGetCount(
        RelationUser.query().whereIn('id', [trashedManyA.id, trashedManyB.id])
      ),
      2
    )

    const rows = await RelationUser.query().withTrashed().orderBy('id')
    assert.isNull(rows.find((row) => row.id === trashedOne.id)?.deletedAt)
    assert.isNull(rows.find((row) => row.id === trashedManyA.id)?.deletedAt)
    assert.isNull(rows.find((row) => row.id === trashedManyB.id)?.deletedAt)
    assert.isNull(rows.find((row) => row.id === active.id)?.deletedAt)
  })

  test('groups OR conditions before filtering to trashed rows', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const active = await createUser('active-first')
    const trashed = await createUser('trashed-second', true)

    const changed = await restoreAndGetCount(
      RelationUser.query().where('username', active.username).orWhere('username', trashed.username)
    )

    assert.equal(changed, 1)
    const rows = await RelationUser.query().withTrashed().whereIn('id', [active.id, trashed.id])
    assert.isNull(rows.find((row) => row.id === active.id)?.deletedAt)
    assert.isNull(rows.find((row) => row.id === trashed.id)?.deletedAt)
  })

  test('uses a model custom deleted-at column', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const post = new CustomPost()
    post.title = 'restore custom column'
    await post.save()
    await CustomPost.query()
      .where('id', post.id)
      .update({ deletedAt: LuxonDateTime.local().toJSDate() })

    const changed = await CustomPost.query().where('id', post.id).restore()

    assert.equal(changed as unknown as number, 1)
    const restored = await CustomPost.query().where('id', post.id).firstOrFail()
    assert.isNull(restored.deletedAt)
  })

  test('honors the transaction client and does not change updated-at', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const user = await createUser('transactional', true)
    const seededUpdatedAt = LuxonDateTime.fromISO('2020-01-02T03:04:05.000Z')
    await db.from('users').where('id', user.id).update({ updated_at: seededUpdatedAt.toJSDate() })

    const trx = await db.transaction()
    const changed = await RelationUser.query({ client: trx }).where('id', user.id).restore()
    const updatedAtDuringRestore = await trx
      .from('users')
      .where('id', user.id)
      .select('updated_at')
      .first()
    await trx.rollback()

    assert.equal(changed, 1)
    const persisted = await RelationUser.query().withTrashed().where('id', user.id).firstOrFail()
    const persistedTimestamps = await db
      .from('users')
      .where('id', user.id)
      .select('updated_at')
      .first()
    assert.isNotNull(persisted.deletedAt)
    assert.equal(new Date(updatedAtDuringRestore.updated_at).getTime(), seededUpdatedAt.toMillis())
    assert.equal(new Date(persistedTimestamps.updated_at).getTime(), seededUpdatedAt.toMillis())
  })

  test('keeps caller predicates when the same builder restores twice', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const target = await createUser('target', true)
    const bystander = await createUser('bystander', true)
    const query = RelationUser.query().where('username', 'target')

    assert.equal(await restoreAndGetCount(query), 1)
    const restored = await RelationUser.findOrFail(target.id)
    await restored.delete()
    assert.equal(await restoreAndGetCount(query), 1)

    const bystanderRow = await db.from('users').where('id', bystander.id).firstOrFail()
    assert.isNotNull(bystanderRow.deleted_at)
  })
})
