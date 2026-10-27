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
import { demonstrateRecovery } from '#services/readme_example'

test('README example hides, finds in trash and restores a persisted record', async ({ assert }) => {
  const result = await demonstrateRecovery(`readme-${Date.now()}-${Math.random()}@example.test`)
  assert.deepEqual(result, {
    id: result.id,
    hidden: true,
    inRecycleBin: true,
    visibleAgain: true,
  })
  const restored = await User.findOrFail(result.id)
  assert.isFalse(restored.trashed)
  await restored.forceDelete()
})
