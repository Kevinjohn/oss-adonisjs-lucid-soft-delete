import type User from '#models/user'
import { isSoftDeleteAdmin } from '#services/soft_delete_admins'

/** Links available in the authenticated starter navigation. */
export function softDeleteNavigation(user: User) {
  const items = [
    { label: 'Dashboard', route: 'dashboard', icon: 'lucide:house' },
    { label: 'Delete account', route: 'account_deletion.show', icon: 'lucide:trash-2' },
  ]

  if (isSoftDeleteAdmin(user)) {
    items.push({
      label: 'Deleted accounts',
      route: 'deleted_users.index',
      icon: 'lucide:archive-restore',
    })
  }

  return items
}
