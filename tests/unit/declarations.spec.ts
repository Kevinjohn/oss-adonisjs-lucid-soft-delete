/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'

test.group('Emitted declarations', () => {
  test('the root entry loads the query builder augmentation', async ({ assert }) => {
    const rootDeclaration = await readFile(
      new URL('../../build/index.d.ts', import.meta.url),
      'utf8'
    )
    const augmentation = await readFile(
      new URL('../../build/src/types/querybuilder.d.ts', import.meta.url),
      'utf8'
    )

    assert.include(rootDeclaration, "import './src/types/querybuilder.js'")
    assert.include(augmentation, "declare module '@adonisjs/lucid/types/model'")
  })
})
