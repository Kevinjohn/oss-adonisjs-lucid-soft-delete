/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { BaseModel, column, hasMany, ModelQueryBuilder } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { createDatabase, createTables } from '../helpers.js'
import {
  RelationComment,
  RelationIndustry,
  RelationPost,
  RelationProfile,
  RelationUser,
} from '../fixtures/models.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'

async function createUser(username: string, managerId: number | null = null) {
  const user = new RelationUser()
  user.fill({ username, email: `${username}@example.test`, managerId })
  await user.save()
  return user
}

/** Pivot rows as a plain model: no soft deletes, so no filter may be added for it. */
class Membership extends BaseModel {
  static table = 'industry_user'
  @column({ isPrimary: true })
  declare id: number
  @column()
  declare userId: number
  @column()
  declare industryId: number
}

class MemberUser extends RelationUser {
  static table = 'users'
  @hasMany(() => Membership, { foreignKey: 'userId' })
  declare memberships: HasMany<typeof Membership>
}

const total = (query: ReturnType<typeof RelationUser.query>) =>
  query
    .count('* as total')
    .first()
    .then((row) => Number((row as { $extras: { total: unknown } } | null)?.$extras.total))

test.group('Soft-delete scope on relation aggregates', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('scopes has-one aggregates and existence checks', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const withProfile = await createUser('with-profile')
    const withTrashedProfile = await createUser('with-trashed-profile')
    await RelationProfile.create({ userId: withProfile.id, displayName: 'kept' })
    const trashed = await RelationProfile.create({
      userId: withTrashedProfile.id,
      displayName: 'gone',
    })
    await trashed.delete()

    assert.equal(await total(RelationUser.query().has('profile')), 1)
    const counted = await RelationUser.query().orderBy('id').withCount('profile')
    assert.deepEqual(
      counted.map((user) => Number(user.$extras.profile_count)),
      [1, 0]
    )
  })

  test('scopes many-to-many aggregates through the pivot join', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const user = await createUser('industrious')
    const active = await RelationIndustry.create({ title: 'active' })
    const trashed = await RelationIndustry.create({ title: 'trashed' })
    await user.related('industries').attach([active.id, trashed.id])
    await trashed.delete()

    const counted = await RelationUser.query()
      .where('id', user.id)
      .withCount('industries')
      .withCount('industries', (query) => query.withTrashed().as('all_industries'))
      .firstOrFail()
    assert.equal(Number(counted.$extras.industries_count), 1)
    assert.equal(Number(counted.$extras.all_industries), 2)
    assert.equal(await total(RelationUser.query().has('industries', '>=', 2)), 0)
    assert.equal(await total(RelationUser.query().has('industries')), 1)
  })

  test('scopes the has-many-through target but not its intermediate model', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const user = await createUser('commented')
    const activePost = await RelationPost.create({ userId: user.id, title: 'active post' })
    const trashedPost = await RelationPost.create({ userId: user.id, title: 'trashed post' })
    await RelationComment.create({ postId: activePost.id, body: 'kept on active post' })
    const trashedComment = await RelationComment.create({ postId: activePost.id, body: 'gone' })
    await RelationComment.create({ postId: trashedPost.id, body: 'kept on trashed post' })
    await trashedComment.delete()
    await trashedPost.delete()

    const counted = await RelationUser.query()
      .where('id', user.id)
      .withCount('comments')
      .firstOrFail()
    assert.equal(Number(counted.$extras.comments_count), 2)
  })

  test('qualifies the filter with the self-join alias for self-referential relations', async ({
    assert,
  }) => {
    const queries: string[] = []
    const db = await createDatabase((event) => queries.push(event.sql))
    await createTables(db)
    const manager = await createUser('manager')
    await createUser('kept-report', manager.id)
    const trashedReport = await createUser('gone-report', manager.id)
    await trashedReport.delete()
    const trashedManager = await createUser('gone-manager')
    await createUser('orphaned-report', trashedManager.id)
    await trashedManager.delete()

    queries.length = 0
    const counted = await RelationUser.query()
      .where('id', manager.id)
      .withCount('reports')
      .firstOrFail()
    assert.equal(Number(counted.$extras.reports_count), 1)
    assert.match(queries[0], /adonis_temp_0.\..deleted_at. is null/)

    assert.equal(await total(RelationUser.query().has('reports')), 1)
    assert.equal(await total(RelationUser.query().has('manager')), 1)
    assert.equal(await total(RelationUser.query().doesntHave('manager')), 2)
  })

  test('leaves aggregates on a related model without soft deletes alone', async ({ assert }) => {
    const queries: string[] = []
    const db = await createDatabase((event) => queries.push(event.sql))
    await createTables(db)
    const user = new MemberUser()
    user.fill({ username: 'member', email: 'member@example.test', managerId: null })
    await user.save()
    await Membership.create({ userId: user.id, industryId: 1 })
    await Membership.create({ userId: user.id, industryId: 2 })

    queries.length = 0
    const counted = await MemberUser.query()
      .where('id', user.id)
      .withCount('memberships')
      .firstOrFail()
    assert.equal(Number(counted.$extras.memberships_count), 2)
    const subQuery = queries[0].match(/\(select count\(\*\) from .industry_user.[^)]*\)/)?.[0]
    assert.isDefined(subQuery)
    assert.notMatch(subQuery!, /deleted_at/)
  })
})
