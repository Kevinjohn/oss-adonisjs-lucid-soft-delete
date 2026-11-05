/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'

test.group('Package exports', () => {
  test('publishes only the renamed provider subpath', async ({ assert }) => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

    assert.equal(
      manifest.exports['./lucid_soft_delete_provider'],
      './build/providers/lucid_soft_delete_provider.js'
    )
    assert.notProperty(manifest.exports, './provider')
  })

  if (!process.env.TEST_BUILT_EXPORTS) return

  test('loads the renamed provider export and rejects the old alias', async ({ assert }) => {
    const provider =
      await import('@kevinjohn/adonisjs-lucid-soft-delete/lucid_soft_delete_provider')
    assert.equal(typeof provider.default, 'function')

    const oldProviderPath = '@kevinjohn/adonisjs-lucid-soft-delete/provider'
    let oldProviderError: unknown
    try {
      await import(oldProviderPath)
    } catch (error) {
      oldProviderError = error
    }
    assert.equal(
      (oldProviderError as NodeJS.ErrnoException | undefined)?.code,
      'ERR_PACKAGE_PATH_NOT_EXPORTED'
    )
  })
})
