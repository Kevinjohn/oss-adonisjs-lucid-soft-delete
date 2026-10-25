/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { DateTime } from 'luxon'
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
