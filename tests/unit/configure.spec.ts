/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { configure } from '../../configure.js'

test.group('configure', () => {
  test('registers the renamed provider path', async ({ assert }) => {
    const providers: string[] = []
    const command = {
      createCodemods: async () => ({
        updateRcFile: async (callback: (rcFile: { addProvider(path: string): void }) => void) => {
          callback({ addProvider: (path) => providers.push(path) })
        },
      }),
    }

    await configure(command as unknown as Parameters<typeof configure>[0])

    assert.deepEqual(providers, ['@kevinjohn/lucid-soft-deletes/provider'])
  })
})
