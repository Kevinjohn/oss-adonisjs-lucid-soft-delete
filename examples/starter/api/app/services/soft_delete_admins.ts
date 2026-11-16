import type User from '#models/user'

/** Only operators may grant this flag on an existing account. */
export function isSoftDeleteAdmin(user: User) {
  return [true, 1].includes(user.isSoftDeleteAdmin)
}
