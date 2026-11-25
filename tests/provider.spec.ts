/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'

test.group('Provider', () => {
  test('application boot installs lifecycle macros used by native Lucid queries', ({ assert }) => {
    // Other specs install the macros on the shared Lucid prototype in the Japa process.
    const fixture = fileURLToPath(new URL('./fixtures/provider_app.ts', import.meta.url))
    const result = spawnSync(process.execPath, ['--import=@poppinss/ts-exec', fixture], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      timeout: 10_000,
    })
    if (result.error) throw result.error
    assert.equal(result.status, 0, result.stderr)
  })
})
