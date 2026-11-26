/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import RemovalForbiddenException from '#exceptions/removal_forbidden_exception'
import { removeUser } from '#services/caller_owned_transaction'

test.group('caller-owned transaction example', () => {
  async function createUser(label: string) {
    const suffix = `${Date.now()}-${Math.random()}`
    return User.create({ email: `${label}-${suffix}@example.test`, username: label })
  }

  function notesFor(id: number) {
    return db.from('lifecycle_notes').where('tenant_id', 0).where('parent_id', id)
  }

  test('a denied removal is a 403 refusal and writes neither table', async ({ assert }) => {
    const user = await createUser('denied')

    const error = await removeUser(user.id, () => false).catch((caught: unknown) => caught)

    assert.instanceOf(error, RemovalForbiddenException)
    assert.equal((error as RemovalForbiddenException).status, 403)
    assert.isNotNull(await User.find(user.id))
    assert.lengthOf(await notesFor(user.id), 0)
    await user.forceDelete()
  })

  test('a permitted removal soft deletes and records one note', async ({ assert }) => {
    const user = await createUser('permitted')

    assert.equal(await removeUser(user.id, async () => true), user.id)

    assert.isNull(await User.find(user.id))
    const trashed = await User.withTrashed().where('id', user.id).firstOrFail()
    assert.isTrue(trashed.trashed)
    assert.lengthOf(await notesFor(user.id), 1)
    await notesFor(user.id).delete()
    await trashed.forceDelete()
  })

  test('a bookkeeping failure after deletion rolls back both writes', async ({ assert }) => {
    const user = await createUser('rollback')

    // A null action violates the notes table's NOT NULL constraint after the soft delete.
    await assert.rejects(() => removeUser(user.id, () => true, null as unknown as string))

    assert.isNotNull(await User.find(user.id))
    assert.lengthOf(await notesFor(user.id), 0)
    await user.forceDelete()
  })
})
