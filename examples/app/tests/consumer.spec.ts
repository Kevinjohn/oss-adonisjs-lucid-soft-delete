/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { BaseModel, ModelQueryBuilder } from '@adonisjs/lucid/orm'
import {
  E_MODEL_FORCE_DELETED,
  E_MODEL_NOT_PERSISTED,
  E_MODEL_SOFT_DELETE,
  hasSoftDeletes,
  SOFT_DELETES,
  SoftDeletes,
} from '@kevinjohn/lucid-soft-deletes'
import User from '#models/user'

class PlainUser extends BaseModel {
  static table = 'users'
}

test('installed package exports and soft-delete lifecycle', async ({ assert }) => {
  assert.isFunction(SoftDeletes)
  assert.isFunction(ModelQueryBuilder.prototype.withTrashed)
  assert.isTrue(hasSoftDeletes(User))
  assert.isFalse(hasSoftDeletes(PlainUser))
  assert.isTrue(User[SOFT_DELETES])
  assert.equal(new E_MODEL_SOFT_DELETE('Plain').code, 'E_MODEL_SOFT_DELETE')

  const unsaved = new User()
  await assert.rejects(() => unsaved.delete(), E_MODEL_NOT_PERSISTED)

  const user = await User.create({
    email: `consumer-${Date.now()}-${Math.random()}@example.test`,
    username: 'consumer',
  })

  assert.isFalse(user.trashed)
  assert.isNotNull(await User.find(user.id))

  await user.delete()
  assert.isTrue(user.trashed)
  assert.isNull(await User.find(user.id))
  assert.isNotNull(await User.withTrashed().where('id', user.id).first())
  assert.isNotNull(await User.query().onlyTrashed().where('id', user.id).first())

  const restored = await User.onlyTrashed().where('id', user.id).restore()
  assert.equal(restored, 1)
  assert.isNotNull(await User.find(user.id))

  await user.refresh()
  await user.delete()
  await user.restore()
  assert.isFalse(user.trashed)

  await user.forceDelete()
  assert.isNull(await User.withTrashed().where('id', user.id).first())
  await assert.rejects(() => user.restore(), E_MODEL_FORCE_DELETED)

  const plainQuery = PlainUser.query() as unknown as { withTrashed(): unknown }
  assert.throws(() => plainQuery.withTrashed(), E_MODEL_SOFT_DELETE)
})

test('installed bulk lifecycle macros return counts and preserve active rows when purging trash', async ({
  assert,
}) => {
  const suffix = `${Date.now()}-${Math.random()}`
  const active = await User.create({
    username: 'bulk-active',
    email: `active-${suffix}@example.test`,
  })
  const target = await User.create({
    username: 'bulk-target',
    email: `target-${suffix}@example.test`,
  })
  assert.equal(await User.query().where('id', target.id).softDelete(), 1)
  assert.equal(await User.onlyTrashed().whereIn('id', [active.id, target.id]).forceDelete(), 1)
  assert.isNotNull(await User.find(active.id))
  assert.isNull(await User.withTrashed().where('id', target.id).first())
  await active.forceDelete()
})
