/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import { E_BULK_RECEIPT_REQUIRES_TRANSACTION, E_BULK_RECEIPT_UNSUPPORTED } from '../../index.js'
import {
  ensureReceiptSupport,
  executeWithReceipt,
  normaliseWriteCount,
  parseReceiptOptions,
} from '../../src/receipts.js'

test.group('Receipt helpers', () => {
  test('validates option values and preserves the numeric count contract', ({ assert }) => {
    for (const value of [null, [], 'yes', 1, false]) {
      assert.throws(() => parseReceiptOptions(value), TypeError)
    }
    assert.throws(() => parseReceiptOptions({ receipt: 'true' }), TypeError)
    assert.throws(() => parseReceiptOptions({ reciept: true }), TypeError)
    for (const value of [undefined, {}, { receipt: undefined }, { receipt: false }]) {
      assert.isFalse(parseReceiptOptions(value))
    }
    assert.isTrue(parseReceiptOptions({ receipt: true }))
    assert.equal(normaliseWriteCount([2]), 2)
    assert.equal(normaliseWriteCount([]), 0)
    assert.equal(normaliseWriteCount([{ id: 1 }, { id: 2 }]), 2)
  })

  test('rejects unsupported dialects and a missing transaction client before inspecting clauses', ({
    assert,
  }) => {
    const unsupported = {
      client: { dialect: { name: 'mssql' } },
    } as unknown as ModelQueryBuilderContract<LucidModel>
    assert.throws(() => ensureReceiptSupport(unsupported), E_BULK_RECEIPT_UNSUPPORTED)
    const missingTransaction = {
      client: { dialect: { name: 'postgres' } },
      knexQuery: {},
    } as unknown as ModelQueryBuilderContract<LucidModel>
    assert.throws(
      () => ensureReceiptSupport(missingTransaction),
      E_BULK_RECEIPT_REQUIRES_TRANSACTION
    )
  })

  test('RETURNING uses mapped primary keys and preserves configured bigint driver values', async ({
    assert,
  }) => {
    const returned: string[] = []
    const target = {
      returning(attribute: string) {
        returned.push(attribute)
      },
    }
    const query = {
      model: {
        primaryKey: 'key',
        $getColumn: (attribute: string) => {
          assert.equal(attribute, 'key')
          return { columnName: 'row_key' }
        },
      },
      client: { dialect: { name: 'postgres' } },
      clone: () => target,
    } as unknown as ModelQueryBuilderContract<LucidModel>
    const result = await executeWithReceipt(query, async (writeTarget) => {
      assert.strictEqual(writeTarget, target)
      return [{ row_key: 9007199254740993n }, { row_key: '9007199254740994' }, { row_key: 42 }]
    })
    assert.deepEqual(returned, ['key'])
    assert.deepEqual(result, { count: 3, ids: ['9007199254740993', '9007199254740994', 42] })
    assert.deepEqual(await executeWithReceipt(query, async () => []), { count: 0, ids: [] })
  })
})
