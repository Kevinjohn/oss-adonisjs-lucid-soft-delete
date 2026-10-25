/*
 * adonis-lucid-soft-deletes
 *
 * Copyright (c) Kevinjohn Gallagher.
 * For the full copyright and license information, please view the LICENSE file.
 */

import { test } from '@japa/runner'
import { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { createDatabase, createTables } from '../helpers.js'
import {
  RelationComment,
  RelationIndustry,
  RelationPost,
  RelationProfile,
  RelationUser,
} from '../fixtures/models.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'

test.group('Default soft-delete scope on relations', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('filters has-one and has-many relations on preload, load, and related queries', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    const user = new RelationUser()
    user.fill({ username: 'active', email: 'active@example.com', managerId: null })
    await user.save()

    const profile = new RelationProfile()
    profile.fill({ userId: user.id, displayName: 'Visible profile' })
    await profile.save()

    const hiddenProfile = new RelationProfile()
    hiddenProfile.fill({ userId: user.id, displayName: 'Deleted profile' })
    await hiddenProfile.save()
    await hiddenProfile.delete()

    const visiblePost = new RelationPost()
    visiblePost.fill({ userId: user.id, title: 'Visible post' })
    await visiblePost.save()

    const hiddenPost = new RelationPost()
    hiddenPost.fill({ userId: user.id, title: 'Deleted post' })
    await hiddenPost.save()
    await hiddenPost.delete()

    const preloaded = await RelationUser.query()
      .where('id', user.id)
      .preload('profile')
      .preload('posts')
      .firstOrFail()

    assert.equal(preloaded.profile.id, profile.id)
    assert.deepEqual(
      preloaded.posts.map((post) => post.id),
      [visiblePost.id]
    )

    await user.load('profile')
    await user.load('posts')
    assert.equal(user.profile.id, profile.id)
    assert.deepEqual(
      user.posts.map((post) => post.id),
      [visiblePost.id]
    )
    assert.deepEqual(
      await user
        .related('posts')
        .query()
        .then((posts) => posts.map((post) => post.id)),
      [visiblePost.id]
    )
  })

  test('filters belongs-to relations when preloading and loading', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const visibleUser = new RelationUser()
    visibleUser.fill({ username: 'visible', email: 'visible@example.com', managerId: null })
    await visibleUser.save()

    const deletedUser = new RelationUser()
    deletedUser.fill({ username: 'deleted', email: 'deleted@example.com', managerId: null })
    await deletedUser.save()
    await deletedUser.delete()

    const visiblePost = new RelationPost()
    visiblePost.fill({ userId: visibleUser.id, title: 'Visible owner' })
    await visiblePost.save()

    const orphanedPost = new RelationPost()
    orphanedPost.fill({ userId: deletedUser.id, title: 'Deleted owner' })
    await orphanedPost.save()

    const posts = await RelationPost.query().preload('user').orderBy('id')
    assert.deepEqual(
      posts.map((post) => post.user?.id ?? null),
      [visibleUser.id, null]
    )

    await orphanedPost.load('user')
    assert.isNull(orphanedPost.user)
  })

  test('filters many-to-many relations on preload and related queries', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const user = new RelationUser()
    user.fill({ username: 'author', email: 'author@example.com', managerId: null })
    await user.save()

    const visibleIndustry = new RelationIndustry()
    visibleIndustry.fill({ title: 'Visible industry' })
    await visibleIndustry.save()

    const hiddenIndustry = new RelationIndustry()
    hiddenIndustry.fill({ title: 'Deleted industry' })
    await hiddenIndustry.save()

    await user.related('industries').attach([visibleIndustry.id, hiddenIndustry.id])
    await hiddenIndustry.delete()

    const preloaded = await RelationUser.query()
      .where('id', user.id)
      .preload('industries')
      .firstOrFail()
    assert.deepEqual(
      preloaded.industries.map((industry) => industry.id),
      [visibleIndustry.id]
    )
    assert.deepEqual(
      await user
        .related('industries')
        .query()
        .then((industries) => industries.map((industry) => industry.id)),
      [visibleIndustry.id]
    )
  })

  test('filters has-many-through and nested relations at each loaded level', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const user = new RelationUser()
    user.fill({ username: 'nested', email: 'nested@example.com', managerId: null })
    await user.save()

    const visiblePost = new RelationPost()
    visiblePost.fill({ userId: user.id, title: 'Visible parent' })
    await visiblePost.save()

    const deletedPost = new RelationPost()
    deletedPost.fill({ userId: user.id, title: 'Deleted parent' })
    await deletedPost.save()
    await deletedPost.delete()

    const visibleComment = new RelationComment()
    visibleComment.fill({ postId: visiblePost.id, body: 'Visible comment' })
    await visibleComment.save()

    const deletedComment = new RelationComment()
    deletedComment.fill({ postId: visiblePost.id, body: 'Deleted comment' })
    await deletedComment.save()
    await deletedComment.delete()

    const commentOnDeletedPost = new RelationComment()
    commentOnDeletedPost.fill({ postId: deletedPost.id, body: 'Comment on deleted post' })
    await commentOnDeletedPost.save()

    const preloaded = await RelationUser.query()
      .where('id', user.id)
      .preload('comments')
      .preload('posts', (posts) => posts.preload('comments'))
      .firstOrFail()

    assert.deepEqual(
      preloaded.comments.map((comment) => comment.id).sort((left, right) => left - right),
      [visibleComment.id, commentOnDeletedPost.id].sort((left, right) => left - right)
    )
    assert.deepEqual(
      preloaded.posts.map((post) => post.id),
      [visiblePost.id]
    )
    assert.deepEqual(
      preloaded.posts[0].comments.map((comment) => comment.id),
      [visibleComment.id]
    )

    await user.load('comments')
    assert.deepEqual(
      user.comments.map((comment) => comment.id).sort((left, right) => left - right),
      [visibleComment.id, commentOnDeletedPost.id].sort((left, right) => left - right)
    )
    const relatedComments = await user.related('comments').query()
    assert.deepEqual(
      relatedComments.map((comment) => comment.id).sort((left, right) => left - right),
      [visibleComment.id, commentOnDeletedPost.id].sort((left, right) => left - right)
    )
  })

  test('filters self-referential relations and nested belongs-to relations', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const manager = new RelationUser()
    manager.fill({ username: 'manager', email: 'manager@example.com', managerId: null })
    await manager.save()

    const visibleReport = new RelationUser()
    visibleReport.fill({
      username: 'visible-report',
      email: 'report@example.com',
      managerId: manager.id,
    })
    await visibleReport.save()

    const deletedReport = new RelationUser()
    deletedReport.fill({
      username: 'deleted-report',
      email: 'deleted-report@example.com',
      managerId: manager.id,
    })
    await deletedReport.save()
    await deletedReport.delete()

    const preloaded = await RelationUser.query()
      .where('id', manager.id)
      .preload('reports')
      .firstOrFail()
    assert.deepEqual(
      preloaded.reports.map((report) => report.id),
      [visibleReport.id]
    )

    await visibleReport.load('manager')
    assert.equal(visibleReport.manager.id, manager.id)
  })
})
