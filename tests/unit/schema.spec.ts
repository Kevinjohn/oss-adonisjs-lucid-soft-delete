/*
 * @kevinjohn/lucid-soft-deletes
 *
 * Copyright (c) Kevinjohn Gallagher.
 * For the full copyright and license information, please view the LICENSE file.
 */

import { compose } from '@adonisjs/core/helpers'
import { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import { SoftDeletes } from '../../src/mixin.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'
import { createDatabase, createTables } from '../helpers.js'
import { UserSchema } from '../fixtures/schema_user.js'

class User extends compose(UserSchema, SoftDeletes) {}

test.group('Generated schema classes with soft deletes', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('finds, soft-deletes, and restores a generated-schema model', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const user = new User()
    user.username = 'schema-user'
    user.email = 'schema-user@example.test'
    await user.save()

    const found = await User.findOrFail(user.id)
    assert.equal(found.username, 'schema-user')
    assert.isFalse(found.trashed)

    await found.delete()
    assert.isTrue(found.trashed)
    assert.isNull(await User.find(user.id))

    const restored = await User.withTrashed().where('id', user.id).firstOrFail()
    await restored.restore()

    assert.isNull(restored.deletedAt)
    const visibleAgain = await User.findOrFail(user.id)
    assert.equal(visibleAgain.id, user.id)
  })
})
