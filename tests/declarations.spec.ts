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
import { errors } from '../index.js'

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

  test('the built root exposes every exception under its name and stable code', async ({
    assert,
  }) => {
    const built: typeof import('../index.js') = await import(
      new URL('../build/index.js', import.meta.url).href
    )
    const namespace = built.errors
    const cases = [
      [
        new namespace.E_LIFECYCLE_WRITE_UNSUPPORTED(),
        namespace.LifecycleWriteUnsupportedException,
        'E_LIFECYCLE_WRITE_UNSUPPORTED',
        'Bulk lifecycle writes do not support many-to-many or has-many-through builders; query the related model by its IDs instead',
      ],
      [
        new namespace.E_MODEL_SOFT_DELETE('PlainUser'),
        namespace.ModelSoftDeleteException,
        'E_MODEL_SOFT_DELETE',
        'PlainUser does not use SoftDeletes',
      ],
      [
        new namespace.E_MODEL_FORCE_DELETED(),
        namespace.ModelForceDeletedException,
        'E_MODEL_FORCE_DELETED',
        'Cannot restore a model instance that was force deleted',
      ],
      [
        new namespace.E_MODEL_NOT_PERSISTED(),
        namespace.ModelNotPersistedException,
        'E_MODEL_NOT_PERSISTED',
        'Cannot mutate a model instance that is not persisted',
      ],
      [
        new namespace.E_MODEL_UNKNOWN_DELETION_STATE(),
        namespace.ModelUnknownDeletionStateException,
        'E_MODEL_UNKNOWN_DELETION_STATE',
        'Cannot restore a model without loading deletedAt; select deletedAt or call refresh()',
      ],
      [
        new namespace.E_BULK_RECEIPT_REQUIRES_TRANSACTION(),
        namespace.BulkReceiptRequiresTransactionException,
        'E_BULK_RECEIPT_REQUIRES_TRANSACTION',
        'Bulk lifecycle receipts require a caller-owned transaction client',
      ],
      [
        new namespace.E_BULK_RECEIPT_UNSUPPORTED('order by clauses'),
        namespace.BulkReceiptUnsupportedException,
        'E_BULK_RECEIPT_UNSUPPORTED',
        'Bulk lifecycle receipts do not support order by clauses',
      ],
      [
        new namespace.E_BULK_RECEIPT_DIVERGED(2, 1),
        namespace.BulkReceiptDivergedException,
        'E_BULK_RECEIPT_DIVERGED',
        'Bulk lifecycle write changed 1 rows but 2 were selected; roll back the transaction',
      ],
    ] as const

    for (const [exception, constructor, code, message] of cases) {
      assert.instanceOf(exception, constructor)
      assert.strictEqual(namespace[code], constructor)
      assert.strictEqual(built[code], constructor)
      assert.equal(constructor.code, code)
      assert.equal(constructor.status, 500)
      assert.equal(exception.code, code)
      assert.equal(exception.status, 500)
      assert.equal(exception.message, message)
      assert.isUndefined(exception.cause)
    }
    assert.strictEqual(
      built.LifecycleWriteUnsupportedException,
      namespace.LifecycleWriteUnsupportedException
    )
    assert.equal(errors.E_MODEL_UNKNOWN_DELETION_STATE.code, 'E_MODEL_UNKNOWN_DELETION_STATE')
  })

  test('the mixed model declaration carries examples for the overridden Lucid methods', async ({
    assert,
  }) => {
    const mixin = await readFile(new URL('../build/src/mixin.d.ts', import.meta.url), 'utf8')
    for (const method of ['delete', 'deleteQuietly']) {
      assert.match(
        mixin,
        new RegExp(
          `@example\\s+\\* \`\`\`ts\\s+\\* await user\\.${method}\\(\\)\\s+\\* \`\`\`\\s+\\*/\\s+${method}\\(`
        )
      )
    }
  })

  test('the root entry exports receipts and their builder overloads', async ({ assert }) => {
    const rootDeclaration = await readFile(new URL('../build/index.d.ts', import.meta.url), 'utf8')
    const augmentation = await readFile(
      new URL('../build/src/types/querybuilder.d.ts', import.meta.url),
      'utf8'
    )
    assert.include(rootDeclaration, 'SoftDeleteReceipt')
    assert.include(augmentation, 'receipt: true')
  })

  test('the root declaration exports the errors namespace', async ({ assert }) => {
    const rootDeclaration = await readFile(new URL('../build/index.d.ts', import.meta.url), 'utf8')

    assert.include(rootDeclaration, 'export * as errors')
  })

  test('the types barrel emits a declaration', async ({ assert }) => {
    const typesDeclaration = await readFile(
      new URL('../build/src/types/index.d.ts', import.meta.url),
      'utf8'
    )

    assert.include(typesDeclaration, 'SoftDeleteReceipt')
  })
})
