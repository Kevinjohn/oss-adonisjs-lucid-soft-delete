import User from '#models/user'
import { isSoftDeleteAdmin } from '#services/soft_delete_admins'
import type { HttpContext } from '@adonisjs/core/http'

const refusal = {
  errors: [{ message: 'Only a soft delete administrator can manage deleted accounts' }],
}

export default class DeletedUsersController {
  /** Lists soft-deleted accounts, most recently deleted first. */
  async index({ auth, response }: HttpContext) {
    if (!isSoftDeleteAdmin(auth.getUserOrFail())) return response.forbidden(refusal)
    const users = await User.onlyTrashed().orderBy('deleted_at', 'desc')
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      deletedAt: user.deletedAt?.toISO() ?? null,
    }))
  }

  /** Restores one soft-deleted account. */
  async restore({ auth, params, response }: HttpContext) {
    if (!isSoftDeleteAdmin(auth.getUserOrFail())) return response.forbidden(refusal)
    const user = await User.onlyTrashed().where('id', params.id).firstOrFail()
    await user.restore()
    return { id: user.id, email: user.email }
  }
}
