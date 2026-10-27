/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { compose } from '@adonisjs/core/helpers'
import {
  BaseModel,
  ModelQueryBuilder,
  beforeFind,
  beforeFetch,
  beforePaginate,
  column,
  hasMany,
} from '@adonisjs/lucid/orm'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { createDatabase, createTables } from '../helpers.js'
import { SoftDeletes } from '../../src/mixin.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'

const SoftDeleteModel = compose(BaseModel, SoftDeletes)
type Hook = (query: ModelQueryBuilderContract<typeof SoftDeleteModel>) => void
function models(hook: Hook, countHook?: Hook) {
  class User extends compose(BaseModel, SoftDeletes) {
    static table = 'users'
    @column({ isPrimary: true }) declare id: number
    @column() declare username: string
    @beforeFind()
    @beforeFetch()
    static append(query: ModelQueryBuilderContract<typeof User>) {
      hook(query)
    }
    @beforePaginate()
    static appendCount([count]: [
      ModelQueryBuilderContract<typeof User>,
      ModelQueryBuilderContract<typeof User>,
    ]) {
      countHook?.(count)
    }
    @hasMany(() => Post) declare posts: HasMany<typeof Post>
  }
  class Post extends compose(BaseModel, SoftDeletes) {
    static table = 'posts'
    @column({ isPrimary: true }) declare id: number
    @column() declare userId: number
    @column() declare title: string
    @beforeFetch()
    static append(query: ModelQueryBuilderContract<typeof Post>) {
      query.orWhere('title', 'deleted')
    }
  }
  User.boot()
  Post.boot()
  return { User, Post }
}
async function setup(
  hook: Hook = (q) => {
    q.orWhere('username', 'deleted')
  },
  countHook?: Hook
) {
  const sql: string[] = []
  const db = await createDatabase((event) => sql.push(event.sql))
  await createTables(db)
  const { User, Post } = models(hook, countHook)
  const active = await User.create({ username: 'active' })
  const deleted = await User.create({ username: 'deleted' })
  await deleted.delete()
  sql.length = 0
  return { db, User, Post, active, deleted, sql }
}
async function rowIds(query: PromiseLike<{ id: number }[]>) {
  const rows = await query
  return rows.map((row) => row.id)
}
const filters = (sql: string) => sql.match(/deleted_at["`]?\s+is (?:not )?null/gi) ?? []
test.group('Subclass query hooks', (group) => {
  group.setup(() => extendModelQueryBuilder(ModelQueryBuilder))
  for (const method of [
    'first',
    'firstOrFail',
    'find',
    'findBy',
    'exec',
    'all',
    'paginate',
  ] as const) {
    test(`keeps appended OR inside the scope for ${method}`, async ({ assert }) => {
      const { User, active, deleted, sql } = await setup()
      let ids: number[]
      switch (method) {
        case 'first':
          assert.isNull(await User.query().where('username', 'missing').first())
          return
        case 'firstOrFail':
          await assert.rejects(() => User.query().where('username', 'missing').firstOrFail())
          return
        case 'find':
          assert.isNull(await User.find(deleted.id))
          return
        case 'findBy':
          assert.isNull(await User.findBy('username', 'deleted'))
          return
        case 'exec':
          ids = await rowIds(User.query().where('username', 'active').exec())
          break
        case 'all':
          assert.deepEqual(await User.all(), [])
          return
        case 'paginate': {
          const page = await User.query().where('username', 'active').paginate(1, 10)
          assert.equal(page.total, 1)
          ids = page.all().map((r) => r.id)
          break
        }
      }
      assert.deepEqual(ids, [active.id])
      for (const query of sql.filter((q) => /^select/i.test(q))) assert.lengthOf(filters(query), 1)
    })
  }
  test('regroups a scope node outside the first collection', async ({ assert }) => {
    const { User, active } = await setup((q) => {
      q.wrapExisting()
      q.orWhere('username', 'deleted')
    })
    assert.deepEqual(await rowIds(User.query().where('username', 'active')), [active.id])
  })
  test('regroups the paginate count hook on its pojo query', async ({ assert }) => {
    const { User, active } = await setup(
      () => {},
      (q) => {
        q.orWhere('username', 'deleted')
      }
    )
    const page = await User.query().where('username', 'active').paginate(1, 10)
    assert.equal(page.total, 1)
    assert.deepEqual(
      page.all().map((r) => r.id),
      [active.id]
    )
  })
  test('preserves only and with modes and appended AND predicates', async ({ assert }) => {
    const { User, active, deleted } = await setup((q) => {
      q.orWhere('username', 'active')
    })
    assert.deepEqual(await rowIds(User.onlyTrashed().where('username', 'deleted')), [deleted.id])
    assert.sameMembers(await rowIds(User.withTrashed().where('username', 'deleted')), [
      active.id,
      deleted.id,
    ])
    const and = models((q) => {
      q.where('username', 'active')
    }).User
    assert.deepEqual(await rowIds(and.all()), [active.id])
  })
  test('retains the existing filter when a later hook changes mode', async ({ assert }) => {
    const { User, active } = await setup((q) => {
      q.withTrashed()
    })
    assert.deepEqual(await rowIds(User.all()), [active.id])
  })
  test('clearWhere in a later hook removes the scope along with caller predicates', async ({
    assert,
  }) => {
    const { User, active, deleted } = await setup((q) => {
      q.clearWhere()
    })
    assert.sameMembers(await rowIds(User.query().where('username', 'missing')), [
      active.id,
      deleted.id,
    ])
  })
  test('reapplies one scope on reused reads, previews, and subsequent physical delete', async ({
    assert,
  }) => {
    const { User, active, deleted, db } = await setup(() => {})
    const query = User.query().where('username', 'active')
    assert.deepEqual(await rowIds(query), [active.id])
    query.orWhere('username', 'deleted')
    assert.deepEqual(await rowIds(query), [active.id])
    assert.lengthOf(filters(query.toQuery()), 1)
    query.orWhere('username', 'deleted')
    await query.delete()
    assert.deepEqual(await rowIds(db.from('users').select('id')), [deleted.id])
  })
  test('scopes hooked related reads and preserves aggregate and group-limit scoping', async ({
    assert,
  }) => {
    const { User, Post, active, sql } = await setup(() => {})
    const kept = await Post.create({ userId: active.id, title: 'active' })
    const removed = await Post.create({ userId: active.id, title: 'deleted' })
    await removed.delete()
    assert.deepEqual(await rowIds(active.related('posts').query().where('title', 'active')), [
      kept.id,
    ])
    const counted = await User.query().where('id', active.id).withCount('posts').firstOrFail()
    assert.equal(Number(counted.$extras.posts_count), 1)
    sql.length = 0
    const users = await User.query()
      .where('id', active.id)
      .preload('posts', (q) => q.where('title', 'active').groupLimit(1).groupOrderBy('id', 'asc'))
    assert.deepEqual(
      users[0].posts.map((r) => r.id),
      [kept.id]
    )
    const limited = sql.find((q) => q.includes('adonis_group_limit_counter'))!
    assert.lengthOf(filters(limited), 1)
    assert.isBelow(
      limited.search(/deleted_at["`]?\s+is null/i),
      limited.search(/\)\s+as ["`]adonis_temp/i)
    )
  })
})
