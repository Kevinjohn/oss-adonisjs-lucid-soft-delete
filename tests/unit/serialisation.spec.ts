/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { DateTime, Settings } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import { SoftDeletes } from '../../src/mixin.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'
import { createDatabase, createTables } from '../helpers.js'

class Post extends compose(BaseModel, SoftDeletes) {
  static table = 'posts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string
}

class HiddenDeletedAtPost extends compose(BaseModel, SoftDeletes) {
  static table = 'posts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column.dateTime({ serializeAs: null })
  declare deletedAt: DateTime | null
}

class RenamedDeletedAtPost extends compose(BaseModel, SoftDeletes) {
  static table = 'posts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column.dateTime({ columnName: 'deletedAt' })
  declare deletedAt: DateTime | null
}

class UtcPost extends Post {
  static table = 'posts'

  @column.dateTime({ serialize: (value: DateTime | null) => value?.toUTC().toISO() ?? null })
  declare deletedAt: DateTime | null
}

class RenamedUtcPost extends Post {
  static table = 'posts'

  @column.dateTime({
    columnName: 'deletedAt',
    serialize: (value: DateTime | null) => value?.toUTC().toISO() ?? null,
  })
  declare deletedAt: DateTime | null
}

test.group('Soft delete serialization', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('serializes deletedAt by default without serializing the trashed getter', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    const post = await Post.create({ title: 'serialized' })
    await post.delete()

    const serialized = post.serialize()
    assert.isString(serialized.deletedAt)
    assert.notProperty(serialized, 'trashed')
  })

  test('respects serializeAs null for deletedAt', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const post = await HiddenDeletedAtPost.create({ title: 'hidden' })
    await post.delete()

    assert.isTrue(post.trashed)
    assert.notProperty(post.serialize(), 'deletedAt')
  })

  test('maps a renamed deleted-at column for persistence and serialization', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const post = await RenamedDeletedAtPost.create({ title: 'renamed' })
    await post.delete()

    const serialized = post.serialize()
    assert.isString(serialized.deletedAt)
    assert.isTrue(post.trashed)
    const loaded = await RenamedDeletedAtPost.withTrashed().where('id', post.id).firstOrFail()
    assert.isTrue(loaded.trashed)
  })

  for (const Model of [UtcPost, RenamedUtcPost]) {
    test(`UTC ISO recipe preserves the lifecycle (${Model.name})`, async ({ assert, cleanup }) => {
      const db = await createDatabase()
      await createTables(db)
      const originalNow = Settings.now
      const originalZone = Settings.defaultZone
      cleanup(() => {
        Settings.now = originalNow
        Settings.defaultZone = originalZone
      })
      Settings.now = () => Date.UTC(2026, 9, 27, 11, 30, 19)
      Settings.defaultZone = 'America/New_York'
      const expected = '2026-10-27T11:30:19.000Z'

      const post = await Model.create({ title: 'UTC recipe', deletedAt: null })
      assert.isNull(post.serialize().deletedAt)
      post.deletedAt = DateTime.fromISO('2026-10-27T07:30:19-04:00', { setZone: true })
      assert.equal(post.serialize().deletedAt, expected)
      post.deletedAt = null
      await post.delete()
      assert.isTrue(DateTime.isDateTime(post.deletedAt))
      assert.isTrue(post.trashed)
      assert.equal(post.serialize().deletedAt, expected)
      assert.isNull(await Model.find(post.id))

      const fetched = await Model.onlyTrashed().where('id', post.id).firstOrFail()
      assert.equal(fetched.serialize().deletedAt, expected)
      await fetched.restore()
      assert.isNull(fetched.serialize().deletedAt)
      assert.isFalse(fetched.trashed)
      await fetched.deleteQuietly()
      assert.equal(fetched.serialize().deletedAt, expected)
      assert.equal(await Model.onlyTrashed().where('id', post.id).restore(), 1)
      await fetched.refresh()
      assert.isNull(fetched.serialize().deletedAt)
      assert.isFalse(fetched.trashed)
      assert.isNotNull(await Model.find(post.id))
    })
  }

  test('reports not trashed when a query omits the deletedAt attribute', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const post = await Post.create({ title: 'projection' })
    await post.delete()

    const selected = await Post.query()
      .withTrashed()
      .select('id', 'title')
      .where('id', post.id)
      .firstOrFail()
    assert.isUndefined(selected.deletedAt)
    assert.isFalse(selected.trashed)
  })
})
