import User from '#models/user'
import { isSoftDeleteAdmin } from '#services/soft_delete_admins'
import { listDeletedUsersValidator, restoreDeletedUserValidator } from '#validators/deleted_user'
import type { HttpContext } from '@adonisjs/core/http'

const refusal = 'Only a soft delete administrator can manage deleted accounts'

export default class DeletedUsersController {
  /** Lists soft-deleted accounts, most recently deleted first. */
  async index({ auth, request, response, inertia }: HttpContext) {
    if (!isSoftDeleteAdmin(auth.getUserOrFail())) return response.forbidden(refusal)
    const { page = 1 } = await request.validateUsing(listDeletedUsersValidator)
    const users = await User.onlyTrashed()
      .select('id', 'email', 'deleted_at')
      .orderBy('deleted_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(page, 25)
    return inertia.render('deleted_users', {
      currentPage: users.currentPage,
      lastPage: users.lastPage,
      users: users.all().map((user) => ({
        id: user.id,
        email: user.email,
        deletedAt: user.deletedAt?.toISODate() ?? '',
      })),
    })
  }

  /** Restores one soft-deleted account. */
  async restore({ auth, request, response, session }: HttpContext) {
    if (!isSoftDeleteAdmin(auth.getUserOrFail())) return response.forbidden(refusal)
    const { params } = await request.validateUsing(restoreDeletedUserValidator)
    const user = await User.onlyTrashed().where('id', params.id).firstOrFail()
    await user.restore()
    session.flash('success', `${user.email} is restored.`)
    return response.redirect().toRoute('deleted_users.index')
  }
}
