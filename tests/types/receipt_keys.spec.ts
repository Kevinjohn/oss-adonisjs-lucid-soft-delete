/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import type {
  ForceDeleteReceipt,
  PrimaryKeyValue,
  RestoreReceipt,
  SoftDeleteReceipt,
} from '../../index.ts'
import type { PrimaryKeyValue as SubpathPrimaryKeyValue } from '../../src/types/index.ts'

test.group('Receipt key types', () => {
  test('accepts numeric, string, and binary keys through both public type entry points', ({
    expectTypeOf,
  }) => {
    expectTypeOf<PrimaryKeyValue>().toEqualTypeOf<SubpathPrimaryKeyValue>()

    const check = (deletedAt: SoftDeleteReceipt['deletedAt']) => {
      const bytes: PrimaryKeyValue = new Uint8Array([1, 2, 3])
      const buffer: SubpathPrimaryKeyValue = Buffer.from([1, 2, 3])
      const ids = [1, 'text-key', String(9007199254740993n), bytes, buffer]
      const deleted: SoftDeleteReceipt = { count: ids.length, ids, deletedAt }
      const restored: RestoreReceipt = { count: ids.length, ids }
      const purged: ForceDeleteReceipt = { count: ids.length, ids }
      // @ts-expect-error BOOLEAN_IS_NOT_A_RECEIPT_KEY
      const booleanKey: PrimaryKeyValue = false
      // @ts-expect-error BIGINT_KEYS_ARE_NORMALIZED_TO_STRINGS
      const rawBigint: PrimaryKeyValue = 1n

      expectTypeOf(deleted).toEqualTypeOf<SoftDeleteReceipt>()
      expectTypeOf(restored).toEqualTypeOf<RestoreReceipt>()
      expectTypeOf(purged).toEqualTypeOf<ForceDeleteReceipt>()
      void [booleanKey, rawBigint]
    }

    expectTypeOf(check).toBeFunction()
  })
})
