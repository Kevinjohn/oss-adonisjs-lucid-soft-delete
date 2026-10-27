/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// #region tutorial
import User from '#models/user'

export function createUser(email: string, username: string) {
  return User.create({ email, username })
}

export function listActiveUsers() {
  return User.query().orderBy('id')
}

export function listRecycleBin() {
  return User.query().onlyTrashed().orderBy('deletedAt', 'desc')
}

export async function hideUser(id: number) {
  const user = await User.findOrFail(id)
  await user.delete()
}

export async function restoreUser(id: number) {
  const user = await User.withTrashed().where('id', id).firstOrFail()
  await user.restore()
}

export async function purgeUser(id: number) {
  const user = await User.onlyTrashed().where('id', id).firstOrFail()
  await user.forceDelete()
}
// #endregion tutorial
