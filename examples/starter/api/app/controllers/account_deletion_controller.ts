import type { HttpContext } from '@adonisjs/core/http'

export default class AccountDeletionController {
  /**
   * Soft deletes the signed-in account. Its row stays, so an administrator can restore it, but
   * normal queries no longer find it: its tokens stop authenticating and it cannot log in.
   */
  async destroy({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    await user.delete()
    return response.noContent()
  }
}
