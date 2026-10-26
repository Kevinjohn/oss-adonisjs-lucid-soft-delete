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
import { SoftDeletes } from '../../index.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'
import { createDatabase, createTables } from '../helpers.js'
import { RelationPost, RelationUser } from '../fixtures/models.js'

class User extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare username: string

  @column()
  declare email: string
}

async function createUser(username: string, trashed = false) {
  const user = new User()
  user.username = username
  user.email = `${username}@example.test`
  await user.save()
  if (trashed) await user.delete()
  return user
}

test.group('Read scope', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('groups a user OR expression before applying the default scope', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await createUser('trashed-first', true)
    const active = await createUser('active-second')

    const rows = await User.query()
      .where('username', 'trashed-first')
      .orWhere('username', 'active-second')

    assert.deepEqual(
      rows.map((row) => row.id),
      [active.id]
    )
  })

  test('groups a user OR expression in only-trashed mode', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const trashed = await createUser('trashed-first', true)
    await createUser('active-second')

    const rows = await User.onlyTrashed()
      .where('username', 'trashed-first')
      .orWhere('username', 'active-second')

    assert.deepEqual(
      rows.map((row) => row.id),
      [trashed.id]
    )
  })

  test('groups nested OR expressions before applying the default scope', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const trashed = await createUser('nested-trashed', true)
    const active = await createUser('nested-active')

    const rows = await User.query().where((query) =>
      query.where('username', trashed.username).orWhere('username', active.username)
    )

    assert.deepEqual(
      rows.map((row) => row.id),
      [active.id]
    )
  })

  test('with-trashed mode preserves both branches of an OR expression', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const trashed = await createUser('with-trashed-branch', true)
    const active = await createUser('with-active-branch')

    const rows = (await User.withTrashed()
      .where('username', trashed.username)
      .orWhere('username', active.username)) as User[]

    assert.sameMembers(
      rows.map((row) => row.id),
      [trashed.id, active.id]
    )
  })

  test('groups OR expressions inside whereHas callbacks', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const parent = new RelationUser()
    parent.fill({ username: 'parent', email: 'parent@example.test', managerId: null })
    await parent.save()

    const trashedPost = new RelationPost()
    trashedPost.fill({ userId: parent.id, title: 'trashed-branch' })
    await trashedPost.save()
    await trashedPost.delete()
    const activePost = new RelationPost()
    activePost.fill({ userId: parent.id, title: 'active-branch' })
    await activePost.save()

    const parents = await RelationUser.query().whereHas('posts', (query) =>
      query.where('title', 'trashed-branch').orWhere('title', 'active-branch')
    )

    assert.deepEqual(
      parents.map((row) => row.id),
      [parent.id]
    )
  })

  test('with-trashed mode adds no filter and survives a clone', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const trashed = await createUser('trashed', true)
    const active = await createUser('active')

    const rows = (await User.withTrashed().orderBy('id').clone()) as User[]

    assert.deepEqual(
      rows.map((row) => row.id),
      [trashed.id, active.id]
    )
  })

  test('only-trashed mode survives a clone', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const trashed = await createUser('trashed', true)
    await createUser('active')

    const rows = await User.onlyTrashed().clone()

    assert.deepEqual(
      rows.map((row) => row.id),
      [trashed.id]
    )
  })

  test('only-trashed clone applies exactly one not-null predicate', async ({ assert }) => {
    const statements: string[] = []
    const db = await createDatabase((event) => statements.push(event.sql))
    await createTables(db)
    const trashed = await createUser('only-clone-trashed', true)
    await createUser('only-clone-active')
    statements.length = 0

    const rows = await User.onlyTrashed().clone()
    const selects = statements.filter((sql) => /^select/i.test(sql.trim()))
    const scopedSelect = selects.at(-1)?.toLowerCase() ?? ''

    assert.deepEqual(
      rows.map((row) => row.id),
      [trashed.id]
    )
    assert.equal((scopedSelect.match(/deleted_at[^,)]*is not null/g) ?? []).length, 1)
  })

  test('captured SQL groups user OR terms before the deleted-at predicate', async ({ assert }) => {
    const statements: string[] = []
    const db = await createDatabase((event) => statements.push(event.sql))
    await createTables(db)
    await createUser('sql-trashed', true)
    const active = await createUser('sql-active')
    statements.length = 0

    const rows = await User.query()
      .where('username', 'sql-trashed')
      .orWhere('username', 'sql-active')

    const select = statements.find((sql) => /^select/i.test(sql.trim()))?.toLowerCase() ?? ''
    const firstPredicate = select.indexOf('username')
    const deletedPredicate = select.indexOf('deleted_at')

    assert.deepEqual(
      rows.map((row) => row.id),
      [active.id]
    )
    assert.isTrue(select.slice(0, firstPredicate).includes('('))
    assert.isTrue(deletedPredicate > firstPredicate)
    assert.match(select.slice(deletedPredicate), /deleted_at["`]?\s+is null/)
  })

  test('pagination count inherits with-trashed mode', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await createUser('trashed', true)
    await createUser('active')

    const page = await User.withTrashed().paginate(1, 10)

    assert.equal(page.total, 2)
    assert.lengthOf(page.all(), 2)
  })

  test('uses object and string aliases for the base table', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await createUser('trashed', true)
    const active = await createUser('active')

    const objectAlias = await User.query().from({ u: 'users' }).where('u.username', 'active')
    const stringAlias = await User.query().from('users as u').where('u.username', 'active')

    assert.deepEqual(
      objectAlias.map((row) => row.id),
      [active.id]
    )
    assert.deepEqual(
      stringAlias.map((row) => row.id),
      [active.id]
    )

    const aliased = User.query().from({ u: 'users' }).where('u.username', 'active')
    const cloned = await aliased.clone()
    const page = await aliased.paginate(1, 10)

    assert.deepEqual(
      cloned.map((row) => row.id),
      [active.id]
    )
    assert.equal(page.total, 1)
    assert.deepEqual(
      page.all().map((row) => row.id),
      [active.id]
    )
  })

  test('qualifies the base table in a self join', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await createUser('trashed', true)
    const active = await createUser('active')

    const rows = await User.query()
      .join('users as other', 'other.id', 'users.id')
      .select('users.*')
      .orderBy('users.id')

    assert.deepEqual(
      rows.map((row) => row.id),
      [active.id]
    )
  })

  test('refreshes an existing trashed instance by identity', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const trashed = await createUser('trashed', true)

    await trashed.refresh()

    assert.isTrue(trashed.trashed)
    assert.isNotNull(trashed.deletedAt)
  })

  test('refreshing a force-deleted instance raises Lucid’s missing-row error', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const deleted = await createUser('force-deleted')
    await deleted.forceDelete()

    await assert.rejects(() => deleted.refresh())
  })

  test('relation builder clone and preload callback preserve with-trashed mode', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const parent = new RelationUser()
    parent.fill({
      username: 'relation-parent',
      email: 'relation-parent@example.test',
      managerId: null,
    })
    await parent.save()
    const active = new RelationPost()
    active.fill({ userId: parent.id, title: 'active-child' })
    await active.save()
    const trashed = new RelationPost()
    trashed.fill({ userId: parent.id, title: 'trashed-child' })
    await trashed.save()
    await trashed.delete()

    const relatedPosts = await parent.related('posts').query().withTrashed().clone()
    const preloaded = await RelationUser.query()
      .where('id', parent.id)
      .preload('posts', (query) => query.withTrashed())
      .firstOrFail()

    assert.sameMembers(
      relatedPosts.map((post) => post.id),
      [active.id, trashed.id]
    )
    assert.sameMembers(
      preloaded.posts.map((post) => post.id),
      [active.id, trashed.id]
    )
  })

  test('does not mutate a builder when SQL is previewed before execution', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await createUser('trashed', true)
    const active = await createUser('active')
    const query = User.query().where('username', 'trashed').orWhere('username', 'active')

    query.toQuery()
    const rows = await query.exec()

    assert.deepEqual(
      rows.map((row) => row.id),
      [active.id]
    )
  })

  test('keeps caller predicates when a builder executes more than once', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const owner = await createUser('owner')
    const other = await createUser('other')
    await createUser('trashed-owner', true)
    const ownPost = await RelationPost.create({ userId: owner.id, title: 'own' })
    await RelationPost.create({ userId: other.id, title: 'other' })

    const loadedOwner = await RelationUser.findOrFail(owner.id)
    const relatedQuery = loadedOwner.related('posts').query()
    const userQuery = User.query().where('username', 'owner').orWhere('username', 'trashed-owner')
    const pageQuery = User.query().where('username', 'other')

    for (let run = 0; run < 2; run++) {
      const posts = await relatedQuery
      const users = await userQuery
      assert.deepEqual(
        posts.map((post) => post.id),
        [ownPost.id]
      )
      assert.deepEqual(
        users.map((user) => user.id),
        [owner.id]
      )
    }
    const page = await pageQuery.paginate(1)
    const first = await pageQuery.firstOrFail()
    assert.deepEqual(
      page.all().map((user) => user.id),
      [other.id]
    )
    assert.equal(first.id, other.id)
    assert.equal((userQuery.toQuery().match(/deleted_at/g) ?? []).length, 1)
  })
})
