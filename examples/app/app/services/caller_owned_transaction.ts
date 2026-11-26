/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

// #region CALLER_OWNED_TRANSACTION
import RemovalForbiddenException from '#exceptions/removal_forbidden_exception'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'

/**
 * `mayRemove` is the host application's authorization callback for the verified actor, for
 * example `(user) => bouncer.allows(removeUserAbility, user)` from the request's `HttpContext`.
 */
export async function removeUser(
  id: number,
  mayRemove: (user: User) => boolean | Promise<boolean>,
  note = 'removed'
) {
  return db.transaction(async (trx) => {
    const user = await User.query({ client: trx }).where('id', id).firstOrFail()
    if (!(await mayRemove(user))) throw new RemovalForbiddenException()
    await user.delete()
    await trx.table('lifecycle_notes').insert({ tenant_id: 0, parent_id: id, action: note })
    return user.id
  })
}
// #endregion CALLER_OWNED_TRANSACTION
