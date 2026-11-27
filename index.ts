import './src/types/querybuilder.ts'

export * as errors from './src/errors.ts'

export { configure } from './configure.ts'
export { withSoftDeletes } from './src/mixin.ts'
export { hasSoftDeletes, SOFT_DELETES } from './src/guard.ts'
export {
  LifecycleWriteUnsupportedException,
  E_LIFECYCLE_WRITE_UNSUPPORTED,
  E_BULK_RECEIPT_REQUIRES_TRANSACTION,
  E_BULK_RECEIPT_UNSUPPORTED,
  E_BULK_RECEIPT_DIVERGED,
  E_MODEL_SOFT_DELETE,
  E_MODEL_FORCE_DELETED,
  E_MODEL_NOT_PERSISTED,
  E_MODEL_UNKNOWN_DELETION_STATE,
} from './src/errors.ts'
export type {
  BulkReceipt,
  BulkReceiptOptions,
  ForceDeleteReceipt,
  PrimaryKeyValue,
  RestoreReceipt,
  SoftDeleteReceipt,
  SoftDeletesConstructor,
  SoftDeletesInstance,
  SoftDeletesModel,
  SoftDeletesStatics,
} from './src/types.ts'
