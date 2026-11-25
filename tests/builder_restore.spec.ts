/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column, ModelQueryBuilder } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { test } from '@japa/runner'
import type { DateTime } from 'luxon'
import { DateTime as LuxonDateTime } from 'luxon'
import { SoftDeletes } from '../index.ts'
import { extendModelQueryBuilder } from '../src/bindings/model_query_builder.ts'
import { createDatabase, createTables } from './helpers.ts'
import { RelationPost, RelationProfile, RelationUser } from './fixtures/models.ts'

class CustomPost extends compose(BaseModel, SoftDeletes) {
  static table = 'posts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column.dateTime({ columnName: 'deletedAt' })
  declare deletedAt: DateTime | null
}

async function createUser(username: string, { trashed = false }: { trashed?: boolean } = {}) {
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
    const trashedOne = await createUser('one', { trashed: true })
    const trashedManyA = await createUser('many-a', { trashed: true })
    const trashedManyB = await createUser('many-b', { trashed: true })

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
    const trashed = await createUser('trashed-second', { trashed: true })

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

    const user = await createUser('transactional', { trashed: true })
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

    const target = await createUser('target', { trashed: true })
    const bystander = await createUser('bystander', { trashed: true })
    const query = RelationUser.query().where('username', 'target')

    assert.equal(await restoreAndGetCount(query), 1)
    const restored = await RelationUser.findOrFail(target.id)
    await restored.delete()
    assert.equal(await restoreAndGetCount(query), 1)

    const bystanderRow = await db.from('users').where('id', bystander.id).firstOrFail()
    assert.isNotNull(bystanderRow.deleted_at)
  })

  test('count mode rejects limit and offset instead of widening the write', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await createUser('one')
    await createUser('two')

    for (const action of ['softDelete', 'restore', 'forceDelete'] as const) {
      for (const shape of ['limit', 'offset'] as const) {
        const query = RelationUser.query().withTrashed()[shape](1) as unknown as Record<
          string,
          () => Promise<number>
        >
        await assert.rejects(
          () => query[action](),
          'Bulk lifecycle writes do not support limit, offset or groupLimit clauses'
        )
      }
    }
    assert.lengthOf(await RelationUser.all(), 2)
  })

  test('count mode accepts cleared windows and aggregate projections', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    for (const username of ['cleared-one', 'cleared-two'])
      await createUser(username, { trashed: true })

    for (const shape of ['limit', 'offset', 'aggregate'] as const) {
      const query = RelationUser.query().where('username', 'cleared-one')
      if (shape === 'limit') query.limit(1).clearLimit()
      else if (shape === 'offset') query.offset(1).clearOffset()
      else query.count('* as total').clearSelect()
      assert.equal(await query.restore(), 1)
      const user = await RelationUser.query().where('username', 'cleared-one').firstOrFail()
      await user.delete()
    }
    assert.equal(await RelationUser.query().where('username', 'cleared-two').restore(), 1)
  })

  test('count mode rejects groupLimit on a has-many builder', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const user = await createUser('parent')
    for (const title of ['a', 'b', 'c']) await RelationPost.create({ userId: user.id, title })

    for (const action of ['softDelete', 'restore', 'forceDelete'] as const) {
      const query = user.related('posts').query().groupLimit(1) as unknown as Record<
        string,
        () => Promise<number>
      >
      await assert.rejects(
        () => query[action](),
        'Bulk lifecycle writes do not support limit, offset or groupLimit clauses'
      )
    }
    assert.lengthOf(await RelationPost.all(), 3)
  })

  test('has-one limits cannot widen a lifecycle write across matching foreign keys', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const user = await createUser('profile-owner')
    await RelationProfile.create({ userId: user.id, displayName: 'first' })
    await RelationProfile.create({ userId: user.id, displayName: 'second' })

    for (const render of [false, true]) {
      const query = user.related('profile').query().limit(1)
      if (render) query.toSQL()
      await assert.rejects(
        () => query.softDelete(),
        'Bulk lifecycle writes do not support limit, offset or groupLimit clauses'
      )
    }
    assert.lengthOf(await RelationProfile.query().where('userId', user.id), 2)
  })

  test('belongs-to limits cannot widen a lifecycle write across a nonunique related key', async ({
    assert,
  }) => {
    class CompanyUser extends RelationUser {
      static table = 'users'
      @column()
      declare companyId: number

      @belongsTo(() => CompanyUser, { localKey: 'companyId', foreignKey: 'companyId' })
      declare relatedUser: BelongsTo<typeof CompanyUser>
    }

    const statements: string[] = []
    const db = await createDatabase((event) => statements.push(event.sql))
    await createTables(db)
    await CompanyUser.createMany([
      { username: 'first', companyId: 1 },
      { username: 'second', companyId: 1 },
    ])
    const parent = new CompanyUser()
    parent.companyId = 1

    let before = statements.length
    await assert.rejects(
      () => parent.related('relatedUser').query().limit(1).softDelete(),
      'Bulk lifecycle writes do not support limit, offset or groupLimit clauses'
    )
    assert.lengthOf(statements, before)
    assert.lengthOf(await RelationUser.all(), 2)

    await RelationUser.query().softDelete()
    const restore = parent.related('relatedUser').query()
    restore.toSQL()
    before = statements.length
    await assert.rejects(
      () => restore.restore(),
      'Bulk lifecycle writes do not support limit, offset or groupLimit clauses'
    )
    assert.lengthOf(statements, before)
    assert.lengthOf(await RelationUser.onlyTrashed(), 2)
  })

  test('count mode applies a belongs-to AND filter before and after SQL preview', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const user = await createUser('parent')
    const other = await createUser('other-parent')
    const post = await RelationPost.create({ userId: user.id, title: 'a' })

    const beforePreview = post.related('user').query().where('username', user.username)
    beforePreview.toSQL()
    assert.equal(await beforePreview.softDelete(), 1)
    const activeAfterDelete = await RelationUser.all()
    assert.deepEqual(
      activeAfterDelete.map(({ id }) => id),
      [other.id]
    )
    assert.equal(await post.related('user').query().restore(), 1)

    const afterPreview = post.related('user').query()
    afterPreview.toSQL()
    afterPreview.where('username', user.username)
    assert.equal(await afterPreview.softDelete(), 1)
    const activeAfterPreviewDelete = await RelationUser.all()
    assert.deepEqual(
      activeAfterPreviewDelete.map(({ id }) => id),
      [other.id]
    )

    const mismatchedFilter = post.related('user').query()
    mismatchedFilter.toSQL()
    mismatchedFilter.where('username', '=', other.username)
    assert.equal(await mismatchedFilter.restore(), 0)
    const stillTrashed = await RelationUser.onlyTrashed()
    assert.deepEqual(
      stillTrashed.map(({ id }) => id),
      [user.id]
    )
  })

  test('count mode rejects a previewed belongs-to limit after the key predicate is cleared or widened', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const user = await createUser('parent')
    const other = await createUser('other-parent')
    const post = await RelationPost.create({ userId: user.id, title: 'a' })
    for (const change of ['clear', 'or'] as const) {
      const query = post.related('user').query()
      query.toSQL()
      if (change === 'clear') query.clearWhere()
      else query.orWhere('id', other.id)
      await assert.rejects(
        () => query.softDelete(),
        'Bulk lifecycle writes do not support limit, offset or groupLimit clauses'
      )
    }
    assert.lengthOf(await RelationUser.all(), 2)
  })

  test('force-deletes only the related row after a belongs-to SQL preview', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const freshUser = await createUser('fresh-parent')
    const previewedUser = await createUser('previewed-parent')
    const other = await createUser('other-parent')
    const freshPost = await RelationPost.create({ userId: freshUser.id, title: 'fresh' })
    const previewedPost = await RelationPost.create({
      userId: previewedUser.id,
      title: 'previewed',
    })

    assert.equal(await freshPost.related('user').query().forceDelete(), 1)
    const rowsBeforePreviewDelete = await RelationUser.withTrashed()
    assert.sameMembers(
      rowsBeforePreviewDelete.map(({ id }) => id),
      [previewedUser.id, other.id]
    )

    const query = previewedPost.related('user').query()
    query.toSQL()

    assert.equal(await query.forceDelete(), 1)
    const rowsAfterPreviewDelete = await RelationUser.withTrashed()
    assert.deepEqual(
      rowsAfterPreviewDelete.map(({ id }) => id),
      [other.id]
    )
  })

  test('count mode accepts the single-row limit Lucid leaves on a rendered belongs-to builder', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const user = await createUser('parent')
    const other = await createUser('other-parent')
    const post = await RelationPost.create({ userId: user.id, title: 'a' })

    const query = post.related('user').query().where('id', user.id).orWhere('id', other.id)
    query.toSQL()

    assert.equal(await query.softDelete(), 1)
    const trashed = await RelationUser.withTrashed().where('id', user.id).firstOrFail()
    assert.isTrue(trashed.trashed)
    assert.lengthOf(await RelationUser.all(), 1)

    assert.equal(await post.related('user').query().limit(1).restore(), 1)
    assert.lengthOf(await RelationUser.all(), 2)
  })
})
