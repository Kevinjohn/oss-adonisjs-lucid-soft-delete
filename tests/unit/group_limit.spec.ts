/*
 * @kevinjohn/lucid-soft-deletes
 *
 * Copyright (c) Kevinjohn Gallagher.
 * For the full copyright and license information, please view the LICENSE file.
 */

import { test } from '@japa/runner'
import { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { createDatabase, createTables } from '../helpers.js'
import { RelationIndustry, RelationPost, RelationUser } from '../fixtures/models.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'

test.group('Soft-delete scope with relation group limits', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('scopes has-many rows before applying per-parent limits in each mode', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    const firstUser = new RelationUser()
    firstUser.fill({ username: 'first', email: 'first@example.test', managerId: null })
    await firstUser.save()

    const secondUser = new RelationUser()
    secondUser.fill({ username: 'second', email: 'second@example.test', managerId: null })
    await secondUser.save()

    async function createPost(userId: number, title: string, trashed = false) {
      const post = new RelationPost()
      post.fill({ userId, title })
      await post.save()
      if (trashed) await post.delete()
      return post
    }

    const firstActiveOne = await createPost(firstUser.id, 'first-active-one')
    const firstDeleted = await createPost(firstUser.id, 'first-deleted', true)
    const firstActiveTwo = await createPost(firstUser.id, 'first-active-two')
    await createPost(firstUser.id, 'first-active-three')

    const secondDeletedOne = await createPost(secondUser.id, 'second-deleted-one', true)
    const secondActiveOne = await createPost(secondUser.id, 'second-active-one')
    const secondDeletedTwo = await createPost(secondUser.id, 'second-deleted-two', true)
    const secondActiveTwo = await createPost(secondUser.id, 'second-active-two')

    const activeUsers = await RelationUser.query()
      .orderBy('id')
      .preload('posts', (posts) => posts.groupLimit(2).groupOrderBy('id', 'asc'))
    assert.deepEqual(
      activeUsers.map((user) => user.posts.map((post) => post.id)),
      [
        [firstActiveOne.id, firstActiveTwo.id],
        [secondActiveOne.id, secondActiveTwo.id],
      ]
    )

    const allUsers = await RelationUser.query()
      .orderBy('id')
      .preload('posts', (posts) => posts.groupLimit(3).groupOrderBy('id', 'asc').withTrashed())
    assert.deepEqual(
      allUsers.map((user) => user.posts.map((post) => post.id)),
      [
        [firstActiveOne.id, firstDeleted.id, firstActiveTwo.id],
        [secondDeletedOne.id, secondActiveOne.id, secondDeletedTwo.id],
      ]
    )

    const deletedUsers = await RelationUser.query()
      .orderBy('id')
      .preload('posts', (posts) => posts.groupLimit(2).groupOrderBy('id', 'asc').onlyTrashed())
    assert.deepEqual(
      deletedUsers.map((user) => user.posts.map((post) => post.id)),
      [[firstDeleted.id], [secondDeletedOne.id, secondDeletedTwo.id]]
    )
  })

  test('scopes many-to-many rows before applying per-parent limits in each mode', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    const firstUser = new RelationUser()
    firstUser.fill({ username: 'first-m2m', email: 'first-m2m@example.test', managerId: null })
    await firstUser.save()

    const secondUser = new RelationUser()
    secondUser.fill({ username: 'second-m2m', email: 'second-m2m@example.test', managerId: null })
    await secondUser.save()

    async function createIndustry(title: string, trashed = false) {
      const industry = new RelationIndustry()
      industry.fill({ title })
      await industry.save()
      if (trashed) await industry.delete()
      return industry
    }

    const firstActiveOne = await createIndustry('first-active-one')
    const firstDeleted = await createIndustry('first-deleted', true)
    const firstActiveTwo = await createIndustry('first-active-two')
    const firstActiveThree = await createIndustry('first-active-three')

    const secondDeletedOne = await createIndustry('second-deleted-one', true)
    const secondActiveOne = await createIndustry('second-active-one')
    const secondDeletedTwo = await createIndustry('second-deleted-two', true)
    const secondActiveTwo = await createIndustry('second-active-two')

    await firstUser
      .related('industries')
      .attach([firstActiveOne.id, firstDeleted.id, firstActiveTwo.id, firstActiveThree.id])
    await secondUser
      .related('industries')
      .attach([secondDeletedOne.id, secondActiveOne.id, secondDeletedTwo.id, secondActiveTwo.id])

    const activeUsers = await RelationUser.query()
      .orderBy('id')
      .preload('industries', (industries) =>
        industries.groupLimit(2).groupOrderBy('industries.id', 'asc')
      )
    assert.deepEqual(
      activeUsers.map((user) => user.industries.map((industry) => industry.id)),
      [
        [firstActiveOne.id, firstActiveTwo.id],
        [secondActiveOne.id, secondActiveTwo.id],
      ]
    )

    const allUsers = await RelationUser.query()
      .orderBy('id')
      .preload('industries', (industries) =>
        industries.groupLimit(3).groupOrderBy('industries.id', 'asc').withTrashed()
      )
    assert.deepEqual(
      allUsers.map((user) => user.industries.map((industry) => industry.id)),
      [
        [firstActiveOne.id, firstDeleted.id, firstActiveTwo.id],
        [secondDeletedOne.id, secondActiveOne.id, secondDeletedTwo.id],
      ]
    )

    const deletedUsers = await RelationUser.query()
      .orderBy('id')
      .preload('industries', (industries) =>
        industries.groupLimit(2).groupOrderBy('industries.id', 'asc').onlyTrashed()
      )
    assert.deepEqual(
      deletedUsers.map((user) => user.industries.map((industry) => industry.id)),
      [[firstDeleted.id], [secondDeletedOne.id, secondDeletedTwo.id]]
    )
  })

  test('qualifies group-limit scopes through object and string relation aliases', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    const user = new RelationUser()
    user.fill({ username: 'aliased-limit', email: 'aliased-limit@example.test', managerId: null })
    await user.save()

    const activePost = new RelationPost()
    activePost.fill({ userId: user.id, title: 'active' })
    await activePost.save()

    const deletedPost = new RelationPost()
    deletedPost.fill({ userId: user.id, title: 'deleted' })
    await deletedPost.save()
    await deletedPost.delete()

    const objectDefault = await RelationUser.query()
      .where('id', user.id)
      .preload('posts', (posts) =>
        posts.from({ p: 'posts' }).groupLimit(2).groupOrderBy('p.id', 'asc')
      )
      .firstOrFail()
    assert.deepEqual(
      objectDefault.posts.map((post) => post.id),
      [activePost.id]
    )

    const objectOnly = await RelationUser.query()
      .where('id', user.id)
      .preload('posts', (posts) =>
        posts.from({ p: 'posts' }).groupLimit(2).groupOrderBy('p.id', 'asc').onlyTrashed()
      )
      .firstOrFail()
    assert.deepEqual(
      objectOnly.posts.map((post) => post.id),
      [deletedPost.id]
    )

    const stringDefault = await RelationUser.query()
      .where('id', user.id)
      .preload('posts', (posts) =>
        posts.from('posts as p').groupLimit(2).groupOrderBy('p.id', 'asc')
      )
      .firstOrFail()
    assert.deepEqual(
      stringDefault.posts.map((post) => post.id),
      [activePost.id]
    )

    const stringOnly = await RelationUser.query()
      .where('id', user.id)
      .preload('posts', (posts) =>
        posts.from('posts as p').groupLimit(2).groupOrderBy('p.id', 'asc').onlyTrashed()
      )
      .firstOrFail()
    assert.deepEqual(
      stringOnly.posts.map((post) => post.id),
      [deletedPost.id]
    )
  })

  test('groups OR predicates before applying the group-limit soft-delete scope', async ({
    assert,
  }) => {
    const queries: string[] = []
    const db = await createDatabase((event) => queries.push(event.sql))
    await createTables(db)

    const user = new RelationUser()
    user.fill({ username: 'or-limit', email: 'or-limit@example.test', managerId: null })
    await user.save()

    const deletedMatch = new RelationPost()
    deletedMatch.fill({ userId: user.id, title: 'deleted-match' })
    await deletedMatch.save()
    await deletedMatch.delete()

    const activeMatch = new RelationPost()
    activeMatch.fill({ userId: user.id, title: 'active-match' })
    await activeMatch.save()

    const users = await RelationUser.query()
      .where('id', user.id)
      .preload('posts', (posts) =>
        posts
          .groupLimit(1)
          .groupOrderBy('id', 'asc')
          .where('title', 'deleted-match')
          .orWhere('title', 'active-match')
      )

    assert.deepEqual(
      users[0].posts.map((post) => post.id),
      [activeMatch.id]
    )
    const sql = queries.find((query) => query.includes('adonis_group_limit_counter'))
    assert.isDefined(sql)
    assert.match(sql!, /where\s+\(.*\bor\b.*\)\s+and .*deleted_at.*is null/i)

    const m2mUser = new RelationUser()
    m2mUser.fill({
      username: 'm2m-or-limit',
      email: 'm2m-or-limit@example.test',
      managerId: null,
    })
    await m2mUser.save()

    const deletedIndustry = new RelationIndustry()
    deletedIndustry.fill({ title: 'm2m-deleted-match' })
    await deletedIndustry.save()
    await deletedIndustry.delete()

    const activeIndustry = new RelationIndustry()
    activeIndustry.fill({ title: 'm2m-active-match' })
    await activeIndustry.save()
    await m2mUser.related('industries').attach([deletedIndustry.id, activeIndustry.id])

    queries.length = 0
    const m2mUsers = await RelationUser.query()
      .where('id', m2mUser.id)
      .preload('industries', (industries) =>
        industries
          .groupLimit(1)
          .groupOrderBy('industries.id', 'asc')
          .where('title', 'm2m-deleted-match')
          .orWhere('title', 'm2m-active-match')
      )

    assert.deepEqual(
      m2mUsers[0].industries.map((industry) => industry.id),
      [activeIndustry.id]
    )
    const m2mSql = queries.find((query) => query.includes('adonis_group_limit_counter'))
    assert.isDefined(m2mSql)
    assert.match(m2mSql!, /where\s+\(.*\bor\b.*\)\s+and .*deleted_at.*is null/i)
  })
})
