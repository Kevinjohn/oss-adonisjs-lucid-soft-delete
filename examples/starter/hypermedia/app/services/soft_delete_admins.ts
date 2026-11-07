import env from '#start/env'

/** Addresses from SOFT_DELETE_ADMIN_EMAILS. Tests add and clear entries directly. */
export const softDeleteAdminEmails = new Set(
  (env.get('SOFT_DELETE_ADMIN_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
)

/** Whether this account may list and restore deleted accounts. */
export function isSoftDeleteAdmin(user: { email: string }) {
  return softDeleteAdminEmails.has(user.email.toLowerCase())
}
