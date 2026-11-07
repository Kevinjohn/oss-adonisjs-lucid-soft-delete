import env from '#start/env'

/**
 * Addresses from SOFT_DELETE_ADMIN_EMAILS, compared exactly: signup keeps an address's case, so
 * `Admin@example.com` is a different account from `admin@example.com`. Tests add and clear entries.
 */
export const softDeleteAdminEmails = new Set(
  (env.get('SOFT_DELETE_ADMIN_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
)

/** Whether this account may list and restore deleted accounts. */
export function isSoftDeleteAdmin(user: { email: string }) {
  return softDeleteAdminEmails.has(user.email)
}
