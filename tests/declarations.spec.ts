/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'
import { E_LIFECYCLE_WRITE_UNSUPPORTED, E_MODEL_UNKNOWN_DELETION_STATE } from '../index.js'

test.group('Emitted declarations', () => {
  if (!process.env.TEST_BUILT_EXPORTS) return

  test('the root entry loads the query builder augmentation', async ({ assert }) => {
    const rootDeclaration = await readFile(new URL('../build/index.d.ts', import.meta.url), 'utf8')
    const augmentation = await readFile(
      new URL('../build/src/types/querybuilder.d.ts', import.meta.url),
      'utf8'
    )

    assert.include(rootDeclaration, "import './src/types/querybuilder.js'")
    assert.include(augmentation, "declare module '@adonisjs/lucid/types/model'")
  })

  test('the root entry exports the unknown deletion state exception', ({ assert }) => {
    assert.equal(E_MODEL_UNKNOWN_DELETION_STATE.code, 'E_MODEL_UNKNOWN_DELETION_STATE')
  })

  test('the built root entry exports the lifecycle write unsupported exception', async ({
    assert,
  }) => {
    assert.equal(E_LIFECYCLE_WRITE_UNSUPPORTED.code, 'E_LIFECYCLE_WRITE_UNSUPPORTED')

    const builtRoot = await import(new URL('../build/index.js', import.meta.url).href)
    const rootDeclaration = await readFile(new URL('../build/index.d.ts', import.meta.url), 'utf8')

    assert.isDefined(builtRoot.E_LIFECYCLE_WRITE_UNSUPPORTED)
    assert.equal(builtRoot.E_LIFECYCLE_WRITE_UNSUPPORTED.code, 'E_LIFECYCLE_WRITE_UNSUPPORTED')
    assert.equal(
      builtRoot.LifecycleWriteUnsupportedException,
      builtRoot.E_LIFECYCLE_WRITE_UNSUPPORTED
    )
    assert.equal(builtRoot.LifecycleWriteUnsupportedException.status, 500)
    assert.include(rootDeclaration, 'E_LIFECYCLE_WRITE_UNSUPPORTED')
    assert.include(rootDeclaration, 'LifecycleWriteUnsupportedException')
  })

  test('the root entry exports receipts and their builder overloads', async ({ assert }) => {
    const rootDeclaration = await readFile(new URL('../build/index.d.ts', import.meta.url), 'utf8')
    const augmentation = await readFile(
      new URL('../build/src/types/querybuilder.d.ts', import.meta.url),
      'utf8'
    )
    assert.include(rootDeclaration, 'SoftDeleteReceipt')
    assert.include(rootDeclaration, 'E_BULK_RECEIPT_DIVERGED')
    assert.include(augmentation, 'receipt: true')
  })
})
