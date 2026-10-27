/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file included with this source code.
 */

import type { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { BaseModel, belongsTo, column, hasMany, ModelQueryBuilder } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { createDatabase, createTables } from '../helpers.js'
import { SoftDeletes } from '../../src/mixin.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'

test.group('Scope bypasses', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('pojo queries return active and trashed records from exec, first, and paginate', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const { User } = createModels()
    const { active, trashed } = await seedUsers(User)
    await trashed.delete()

    const rows = (await User.query().pojo().exec()) as { id: number }[]
    const first = (await User.query().where('id', trashed.id).pojo().first()) as {
      id: number
    } | null
    const page = await User.query().pojo().paginate(1, 10)

    assert.sameMembers(
      rows.map((row) => row.id),
      [active.id, trashed.id]
    )
    assert.equal(first?.id, trashed.id)
    assert.equal(page.total, 2)
    assert.sameMembers(
      (page.all() as { id: number }[]).map((row) => row.id),
      [active.id, trashed.id]
    )
  })

  test('bulk update and increment include trashed rows, while delete and del physically remove rows', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const { User } = createModels()
    const { active, trashed } = await seedUsers(User)
    await trashed.delete()

    await User.query().whereIn('id', [active.id, trashed.id]).update({ companyId: 7 })
    await User.query().whereIn('id', [active.id, trashed.id]).increment('companyId', 1)
    assert.equal(
      await User.query()
        .withTrashed()
        .where('companyId', 8)
        .count('* as total')
        .first()
        .then((row) => row?.$extras.total),
      2
    )

    await User.query().where('id', active.id).delete()
    await User.query().where('id', trashed.id).del()

    assert.equal(
      await db
        .from('users')
        .whereIn('id', [active.id, trashed.id])
        .count('* as total')
        .first()
        .then((row) => row?.total),
      0
    )
  })

  test('related query delete and db.from operate without the model scope', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const { User, Post } = createModels()
    const { active, trashed } = await seedUsers(User)
    const posts = await seedPosts(Post, active.id)
    await posts.trashed.delete()
    await trashed.delete()

    assert.equal(
      await db
        .from('users')
        .count('* as total')
        .first()
        .then((row) => row?.total),
      2
    )
    assert.equal(
      await db
        .from('posts')
        .count('* as total')
        .first()
        .then((row) => row?.total),
      2
    )

    await active.related('posts').query().delete()
    assert.equal(
      await db
        .from('posts')
        .where('user_id', active.id)
        .count('* as total')
        .first()
        .then((row) => row?.total),
      0
    )
  })

  test('a join from a model without soft deletes does not filter the joined users', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const { User, Role } = createModels()
    const { active, trashed } = await seedUsers(User)
    await trashed.delete()
    await Role.create({ title: 'member 1' })
    await Role.create({ title: 'member 2' })

    const rows = await Role.query()
      .join('users', 'users.id', '=', 'roles.id')
      .select('users.id as userId')
    assert.sameMembers(
      rows.map((row) => row.$extras.userId),
      [active.id, trashed.id]
    )
  })

  test('relation aggregates and existence checks exclude trashed children', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const { User, Post } = createModels()
    const { active, trashed } = await seedUsers(User)
    const orphan = await User.create({ username: 'trashed-only-parent', companyId: 0 })
    const activePosts = await seedPosts(Post, active.id)
    const trashedPosts = await seedPosts(Post, trashed.id)
    const orphanPost = await Post.create({ userId: orphan.id, title: 'orphan trashed post' })
    await activePosts.trashed.delete()
    await trashedPosts.trashed.delete()
    await orphanPost.delete()

    const total = (query: ReturnType<typeof User.query>) =>
      query
        .count('* as total')
        .first()
        .then((row) => Number((row as { $extras: { total: unknown } } | null)?.$extras.total))

    const counted = await User.query().where('id', active.id).withCount('posts').firstOrFail()
    assert.equal(Number(counted.$extras.posts_count), 1)
    assert.equal(await total(User.query().has('posts')), 2)
    assert.equal(await total(User.query().has('posts', '>=', 2)), 0)
    assert.equal(
      await total(
        User.query().whereHas('posts', (query) => query.where('title', 'orphan trashed post'))
      ),
      0
    )
    assert.equal(
      await total(User.query().whereHas('posts', (query) => query.where('title', 'active post'))),
      2
    )
    assert.equal(await total(User.query().doesntHave('posts')), 1)

    await active.loadCount('posts')
    assert.equal(Number(active.$extras.posts_count), 1)

    const aggregate = await User.query()
      .where('id', active.id)
      .withAggregate('posts', (query) => query.count('*').as('posts_count_aggregate'))
      .firstOrFail()
    assert.equal(Number(aggregate.$extras.posts_count_aggregate), 1)

    await active.loadAggregate('posts', (query) => query.count('*').as('posts_count_aggregate'))
    assert.equal(Number(active.$extras.posts_count_aggregate), 1)
  })

  test('withTrashed and onlyTrashed inside an aggregate callback switch the sub-query mode', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)
    const { User, Post } = createModels()
    const { active } = await seedUsers(User)
    const posts = await seedPosts(Post, active.id)
    await posts.trashed.delete()

    const user = await User.query()
      .where('id', active.id)
      .withCount('posts', (query) => query.withTrashed().as('all_posts'))
      .withCount('posts', (query) => query.onlyTrashed().as('trashed_posts'))
      .withCount('posts')
      .firstOrFail()
    assert.equal(Number(user.$extras.all_posts), 2)
    assert.equal(Number(user.$extras.trashed_posts), 1)
    assert.equal(Number(user.$extras.posts_count), 1)

    const withTrashedParents = await User.query()
      .whereHas('posts', (query) => query.withTrashed().where('title', 'trashed post'))
      .count('* as total')
      .first()
    assert.equal(Number(withTrashedParents?.$extras.total), 1)
  })

  test('a relation onQuery callback scopes withCount to active children', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const { User, Post } = createModels()
    const { active } = await seedUsers(User)
    const posts = await seedPosts(Post, active.id)
    await posts.trashed.delete()

    const user = await User.query().where('id', active.id).withCount('activePosts').firstOrFail()
    assert.equal(Number(user.$extras.activePosts_count), 1)
  })
})

function createModels() {
  class User extends compose(BaseModel, SoftDeletes) {
    @column({ isPrimary: true })
    declare id: number

    @column()
    declare username: string

    @column()
    declare companyId: number

    @column.dateTime({ serializeAs: null })
    declare deletedAt: DateTime | null

    @hasMany(() => Post)
    declare posts: HasMany<typeof Post>

    @hasMany(() => Post, {
      onQuery: (query) => query.whereNull('deleted_at'),
    })
    declare activePosts: HasMany<typeof Post>
  }

  class Post extends compose(BaseModel, SoftDeletes) {
    @column({ isPrimary: true })
    declare id: number

    @column()
    declare userId: number

    @column()
    declare title: string

    @column.dateTime({ serializeAs: null })
    declare deletedAt: DateTime | null

    @belongsTo(() => User)
    declare user: BelongsTo<typeof User>
  }

  class Role extends BaseModel {
    @column({ isPrimary: true })
    declare id: number

    @column()
    declare title: string
  }

  User.boot()
  Post.boot()
  Role.boot()
  return { User, Post, Role }
}

async function seedUsers(User: ReturnType<typeof createModels>['User']) {
  const active = await User.create({ username: 'active', companyId: 0 })
  const trashed = await User.create({ username: 'trashed', companyId: 0 })
  return { active, trashed }
}

async function seedPosts(Post: ReturnType<typeof createModels>['Post'], userId: number) {
  const active = await Post.create({ userId, title: 'active post' })
  const trashed = await Post.create({ userId, title: 'trashed post' })
  return { active, trashed }
}
