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
import {
  E_BULK_RECEIPT_DIVERGED,
  E_BULK_RECEIPT_REQUIRES_TRANSACTION,
  E_BULK_RECEIPT_UNSUPPORTED,
} from '../../index.js'
import {
  ensureReceiptSupport,
  executeWithReceipt,
  normaliseWriteCount,
  parseReceiptOptions,
} from '../../src/receipts.js'

/** Exercise the preselect algorithm independently of the suite's configured database driver. */
function preselectQuery(dialect: string, rows: Record<string, unknown>[]) {
  const state = {
    clones: 0,
    plainObjects: false,
    clearedSelect: false,
    selected: '',
    ordered: [] as string[],
    locked: false,
    restricted: [] as unknown[],
  }
  const selector = {
    knexQuery: { _method: 'update' },
    pojo() {
      state.plainObjects = true
      return this
    },
    clearSelect() {
      state.clearedSelect = true
      return this
    },
    select(reference: string) {
      state.selected = reference
      return this
    },
    orderBy(reference: string, direction: string) {
      state.ordered = [reference, direction]
      return this
    },
    forUpdate() {
      state.locked = true
      return this
    },
    async exec() {
      return rows
    },
  }
  const target = {
    whereIn(reference: string, ids: unknown[]) {
      state.restricted = [reference, ids]
    },
  }
  const query = {
    model: {
      primaryKey: 'handle',
      $getColumn: () => ({ columnName: 'username' }),
    },
    client: { dialect: { name: dialect } },
    knexQuery: { _method: 'update', _single: { table: 'users as selected' } },
    clone() {
      return state.clones++ === 0 ? selector : target
    },
  } as unknown as ModelQueryBuilderContract<LucidModel>
  return { query, selector, target, state }
}

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

  test('preselect receipts write only the selected raw keys on separate clones', async ({
    assert,
  }) => {
    for (const dialect of ['mysql', 'better-sqlite3']) {
      const { query, selector, target, state } = preselectQuery(dialect, [
        { username: 'one' },
        { username: 9007199254740993n },
      ])
      let writes = 0
      const result = await executeWithReceipt(query, async (writeTarget) => {
        writes++
        assert.strictEqual(writeTarget, target)
        assert.deepEqual(state.restricted, ['selected.username', ['one', '9007199254740993']])
        return [2]
      })
      assert.deepEqual(result, { count: 2, ids: ['one', '9007199254740993'] })
      assert.equal(writes, 1)
      assert.equal(state.clones, 2)
      assert.isTrue(state.plainObjects)
      assert.isTrue(state.clearedSelect)
      assert.equal(selector.knexQuery._method, 'select')
      assert.equal(state.selected, 'selected.username')
      assert.deepEqual(state.ordered, ['selected.username', 'asc'])
      assert.equal(state.locked, dialect === 'mysql')
      assert.equal((query.knexQuery as unknown as { _method: string })._method, 'update')
    }
  })

  test('an empty preselect never executes the write', async ({ assert }) => {
    const { query, state } = preselectQuery('better-sqlite3', [])
    let writes = 0
    const result = await executeWithReceipt(query, async () => {
      writes++
      return [0]
    })
    assert.deepEqual(result, { count: 0, ids: [] })
    assert.equal(writes, 0)
    assert.equal(state.clones, 1)
  })

  test('a divergent preselect receipt reports both counts after executing the write', async ({
    assert,
  }) => {
    const { query, target } = preselectQuery('mysql', [{ username: 'one' }, { username: 'two' }])
    let wrote = false
    let caught: unknown
    try {
      await executeWithReceipt(query, async (writeTarget) => {
        assert.strictEqual(writeTarget, target)
        wrote = true
        return [0]
      })
    } catch (error) {
      caught = error
    }
    assert.isTrue(wrote)
    assert.instanceOf(caught, E_BULK_RECEIPT_DIVERGED)
    const error = caught as E_BULK_RECEIPT_DIVERGED
    assert.equal(error.expected, 2)
    assert.equal(error.actual, 0)
    assert.equal(error.code, 'E_BULK_RECEIPT_DIVERGED')
    assert.equal(error.status, 500)
    assert.equal(
      error.message,
      'Bulk lifecycle write changed 0 rows but 2 were selected; roll back the transaction'
    )
  })
})
