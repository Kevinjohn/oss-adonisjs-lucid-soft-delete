/** Compile-time consumer contracts for raw receipt keys through both public type entry points. */
import type {
  PrimaryKeyValue,
  SoftDeleteReceipt,
  RestoreReceipt,
  ForceDeleteReceipt,
} from '../../index.ts'
import type { PrimaryKeyValue as SubpathPrimaryKeyValue } from '../../src/types/index.ts'

export function assertReceiptKeyContracts(deletedAt: SoftDeleteReceipt['deletedAt']): void {
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
  void [deleted, restored, purged, booleanKey, rawBigint]
}
