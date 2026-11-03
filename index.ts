import './src/types/querybuilder.js'

export { configure } from './configure.js'
export { SoftDeletes } from './src/mixin.js'
export type {
  SoftDeletesInstance,
  SoftDeletesStatics,
  SoftDeletesConstructor,
} from './src/mixin.js'
export { hasSoftDeletes, SOFT_DELETES } from './src/guard.js'
export type { SoftDeletesModel } from './src/guard.js'
export {
  E_LIFECYCLE_WRITE_UNSUPPORTED,
  E_BULK_RECEIPT_REQUIRES_TRANSACTION,
  E_BULK_RECEIPT_UNSUPPORTED,
  E_BULK_RECEIPT_DIVERGED,
  E_MODEL_SOFT_DELETE,
  E_MODEL_FORCE_DELETED,
  E_MODEL_NOT_PERSISTED,
  E_MODEL_UNKNOWN_DELETION_STATE,
} from './src/errors.js'
export type {
  BulkReceipt,
  BulkReceiptOptions,
  ForceDeleteReceipt,
  PrimaryKeyValue,
  RestoreReceipt,
  SoftDeleteReceipt,
} from './src/receipts.js'
