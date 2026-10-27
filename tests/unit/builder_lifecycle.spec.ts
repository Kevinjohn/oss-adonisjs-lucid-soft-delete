/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file included with this source code.
 */

import { compose } from '@adonisjs/core/helpers'
import {
  BaseModel,
  beforeDelete,
  beforeUpdate,
  column,
  ModelQueryBuilder,
} from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import { DateTime, Settings } from 'luxon'
import { E_MODEL_SOFT_DELETE, SoftDeletes } from '../../index.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'
import { createDatabase, createTables } from '../helpers.js'
import { RelationComment, RelationUser, RelationPost } from '../fixtures/models.js'

class LifecycleUser extends compose(BaseModel, SoftDeletes) {
  static table = 'users'
  static hooksRun = 0
  @column({ isPrimary: true }) declare id: number
  @column() declare username: string
  @column() declare companyId: number
  @column.dateTime() declare updatedAt: DateTime
  @beforeDelete()
  @beforeUpdate()
  static trackHook() {
    this.hooksRun++
  }
}
class CustomPost extends compose(BaseModel, SoftDeletes) {
  static table = 'posts'
  @column({ isPrimary: true }) declare id: number
  @column() declare title: string
  @column.dateTime({
    columnName: 'deletedAt',
    prepare: () => {
      throw new Error('prepare must be bypassed')
    },
  })
  declare deletedAt: DateTime | null
}

test.group('Builder lifecycle', (group) => {
  group.setup(() => extendModelQueryBuilder(ModelQueryBuilder))
  test('softDelete mode matrix, zero one many counts and timestamp stability', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const previousNow = Settings.now
    Settings.now = () => Date.UTC(2026, 9, 27, 12, 30, 0)
    try {
      const rows = await LifecycleUser.createMany([
        { username: 'one' },
        { username: 'two' },
        { username: 'three' },
      ])
      const updatedAt = DateTime.utc(2020, 1, 1).toFormat(db.connection().dialect.dateTimeFormat)
      await db.from('users').update({ updated_at: updatedAt })
      const beforeTimestamp = await db.from('users').where('id', rows[0].id).firstOrFail()
      LifecycleUser.hooksRun = 0
      assert.equal(await LifecycleUser.query().where('id', -1).softDelete(), 0)
      assert.equal(await LifecycleUser.query().where('id', rows[0].id).softDelete(), 1)
      const first = await LifecycleUser.withTrashed().where('id', rows[0].id).firstOrFail()
      assert.equal(first.deletedAt!.toMillis(), Settings.now())
      Settings.now = () => Date.UTC(2026, 9, 28)
      assert.equal(await LifecycleUser.onlyTrashed().softDelete(), 0)
      assert.equal(await LifecycleUser.withTrashed().softDelete(), 2)
      const again = await LifecycleUser.withTrashed().where('id', rows[0].id).firstOrFail()
      assert.equal(again.deletedAt!.toMillis(), first.deletedAt!.toMillis())
      const afterTimestamp = await db.from('users').where('id', rows[0].id).firstOrFail()
      assert.equal(String(afterTimestamp.updated_at), String(beforeTimestamp.updated_at))
      assert.equal(LifecycleUser.hooksRun, 0)
    } finally {
      Settings.now = previousNow
    }
  })
  test('forceDelete modes preserve active rows only in onlyTrashed mode', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    for (const mode of ['default', 'with', 'only'] as const) {
      const active = await LifecycleUser.create({ username: `${mode}-active` })
      const trashed = await LifecycleUser.create({ username: `${mode}-trashed` })
      await trashed.delete()
      const query = LifecycleUser.query().whereIn('id', [active.id, trashed.id])
      if (mode === 'with') query.withTrashed()
      if (mode === 'only') query.onlyTrashed()
      LifecycleUser.hooksRun = 0
      assert.equal(await query.forceDelete(), mode === 'only' ? 1 : 2)
      assert.equal(LifecycleUser.hooksRun, 0)
      assert.equal(await query.forceDelete(), 0)
    }
    const rows = await db.from('users')
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].username, 'only-active')
  })
  test('preserves grouped OR, whereIn, tenant predicates and an aliased base table', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const rows = await LifecycleUser.createMany([
      { username: 'matching-a', companyId: 1 },
      { username: 'matching-b', companyId: 1 },
      { username: 'matching-other-tenant', companyId: 2 },
      { username: 'unmatched', companyId: 1 },
    ])
    const query = LifecycleUser.query()
      .from('users as selected')
      .where('company_id', 1)
      .whereIn(
        'id',
        rows.slice(0, 3).map((row) => row.id)
      )
      .where((nested) => nested.where('username', 'matching-a').orWhere('username', 'matching-b'))
    assert.equal(await query.softDelete(), 2)
    assert.equal((query.toQuery().match(/deleted_at.*?is null/gi) || []).length, 1)
    assert.equal(await query.softDelete(), 0)
    assert.equal((query.toQuery().match(/deleted_at.*?is null/gi) || []).length, 1)
    const clone = query.clone()
    assert.equal(await clone.softDelete(), 0)
    assert.equal((clone.toQuery().match(/deleted_at.*?is null/gi) || []).length, 1)
    query.onlyTrashed()
    assert.equal(await query.forceDelete(), 2)
    assert.equal((query.toQuery().match(/deleted_at/g) || []).length, 1)
    query.withTrashed()
    assert.equal(await query.forceDelete(), 0)
    assert.equal((query.toQuery().match(/deleted_at/g) || []).length, 0)
    const survivors = await db.from('users')
    assert.sameMembers(
      survivors.map((row) => row.username),
      ['matching-other-tenant', 'unmatched']
    )
  })
  test('supports renamed columns while bypassing custom prepare', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await db.table('posts').insert({ title: 'custom' })
    assert.equal(await CustomPost.query().softDelete(), 1)
    const row = await db.from('posts').firstOrFail()
    assert.isNotNull(row.deletedAt)
    assert.isNull(row.deleted_at)
    assert.equal(await CustomPost.onlyTrashed().forceDelete(), 1)
  })
  test('honors transaction clients for commit and rollback using both entry points', async ({
    assert,
    cleanup,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const user = await LifecycleUser.create({ username: 'transaction' })
    for (const entry of ['client', 'useTransaction'] as const) {
      for (const commit of [false, true]) {
        const trx = await db.transaction()
        cleanup(async () => {
          if (!trx.isCompleted) await trx.rollback()
        })
        const query =
          entry === 'client'
            ? LifecycleUser.query({ client: trx })
            : LifecycleUser.query().useTransaction(trx)
        assert.equal(await query.where('id', user.id).softDelete(), 1)
        const inside = await trx.from('users').firstOrFail()
        assert.isNotNull(inside.deleted_at)
        if (commit) await trx.commit()
        else await trx.rollback()
        const persisted = await db.from('users').firstOrFail()
        assert.equal(persisted.deleted_at !== null, commit)
        await db.from('users').update({ deleted_at: null })
        const purgeTrx = await db.transaction()
        cleanup(async () => {
          if (!purgeTrx.isCompleted) await purgeTrx.rollback()
        })
        const purge =
          entry === 'client'
            ? LifecycleUser.query({ client: purgeTrx })
            : LifecycleUser.query().useTransaction(purgeTrx)
        assert.equal(await purge.where('id', user.id).forceDelete(), 1)
        if (commit) await purgeTrx.commit()
        else await purgeTrx.rollback()
        const remaining = await db.from('users')
        assert.lengthOf(remaining, commit ? 0 : 1)
        if (commit) await db.table('users').insert({ id: user.id, username: 'transaction' })
      }
    }
  })
  test('has-many writes retain the parent predicate and many-to-many writes reject before changing pivots', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const parent = await RelationUser.create({ username: 'parent' })
    const other = await RelationUser.create({ username: 'other' })
    await RelationPost.createMany([
      { userId: parent.id, title: 'selected' },
      { userId: other.id, title: 'other' },
    ])
    assert.equal(await parent.related('posts').query().softDelete(), 1)
    assert.equal(await parent.related('posts').query().onlyTrashed().forceDelete(), 1)
    const posts = await db.from('posts')
    assert.equal(posts[0].user_id, other.id)
    await db.table('industries').insert({ id: 1, title: 'retained' })
    await db.table('industry_user').insert({ user_id: parent.id, industry_id: 1 })
    await assert.rejects(() => parent.related('industries').query().softDelete(), /many-to-many/)
    await assert.rejects(() => parent.related('industries').query().forceDelete(), /many-to-many/)
    await assert.rejects(
      () => parent.related('industries').query().onlyTrashed().restore(),
      /many-to-many/
    )
    assert.lengthOf(await db.from('industry_user'), 1)
    const industry = await db.from('industries').firstOrFail()
    assert.isNull(industry.deleted_at)
  })
  test('has-many-through writes reject before running the sub-query', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const parent = await RelationUser.create({ username: 'parent' })
    const post = await RelationPost.create({ userId: parent.id, title: 'post' })
    await RelationComment.create({ postId: post.id, body: 'kept' })
    const comments = () => parent.related('comments').query()
    await assert.rejects(() => comments().softDelete(), /has-many-through/)
    await assert.rejects(() => comments().forceDelete(), /has-many-through/)
    await assert.rejects(() => comments().onlyTrashed().restore(), /has-many-through/)
    const [comment] = await db.from('comments')
    assert.isNull(comment.deleted_at)
  })
  test('plain models reject both macros and foreign key errors reach the caller', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    class PlainUser extends BaseModel {
      static table = 'users'
    }
    for (const method of ['softDelete', 'forceDelete'] as const) {
      await assert.rejects(
        () =>
          (PlainUser.query() as unknown as Record<typeof method, () => Promise<number>>)[method](),
        E_MODEL_SOFT_DELETE
      )
    }
    await db
      .connection()
      .rawQuery('PRAGMA foreign_keys = ON')
      .catch(() => {})
    await db.table('books').insert({ id: 1, name: 'book' })
    await db.table('authors').insert({ id: 1, name: 'author' })
    await db.table('author_book').insert({ book_id: 1, author_id: 1 })
    class Book extends compose(BaseModel, SoftDeletes) {
      static table = 'books'
      @column({ isPrimary: true }) declare id: number
    }
    await assert.rejects(() => Book.query().forceDelete())
    assert.lengthOf(await db.from('books'), 1)
  })
})
