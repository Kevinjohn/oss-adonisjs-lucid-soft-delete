/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import User from '#models/user'
import {
  createUser,
  hideUser,
  listActiveUsers,
  listRecycleBin,
  purgeUser,
  restoreUser,
} from '#services/recycle_bin'

test('recycle bin create, hide, list, restore, and confirmed purge journey', async ({ assert }) => {
  const suffix = `${Date.now()}-${Math.random()}`
  const user = await createUser(`tutorial-${suffix}@example.test`, 'tutorial-user')

  assert.isNotNull(await User.find(user.id))
  const activeBeforeHide = await listActiveUsers()
  assert.isTrue(activeBeforeHide.some((row) => row.id === user.id))

  await hideUser(user.id)
  assert.isNull(await User.find(user.id))
  const recycleBinAfterHide = await listRecycleBin()
  assert.isTrue(recycleBinAfterHide.some((row) => row.id === user.id))

  await restoreUser(user.id)
  assert.isNotNull(await User.find(user.id))
  const recycleBinAfterRestore = await listRecycleBin()
  assert.isFalse(recycleBinAfterRestore.some((row) => row.id === user.id))

  await hideUser(user.id)
  await purgeUser(user.id)
  assert.isNull(await User.withTrashed().where('id', user.id).first())
  const recycleBinAfterPurge = await listRecycleBin()
  assert.isFalse(recycleBinAfterPurge.some((row) => row.id === user.id))
})
