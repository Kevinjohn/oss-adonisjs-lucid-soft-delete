/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { Exception } from '@adonisjs/core/exceptions'

export class LifecycleWriteUnsupportedException extends Exception {
  static code = 'E_LIFECYCLE_WRITE_UNSUPPORTED'
  static status = 500

  constructor(reason: string) {
    super(`Bulk lifecycle writes do not support ${reason}`)
  }
}

export class ModelSoftDeleteException extends Exception {
  static code = 'E_MODEL_SOFT_DELETE'
  static status = 500

  constructor(modelName: string) {
    super(`${modelName} does not use SoftDeletes`)
  }
}

export class ModelForceDeletedException extends Exception {
  static code = 'E_MODEL_FORCE_DELETED'
  static status = 500
  static message = 'Cannot restore a model instance that was force deleted'

  constructor() {
    super()
  }
}

export class ModelNotPersistedException extends Exception {
  static code = 'E_MODEL_NOT_PERSISTED'
  static status = 500
  static message = 'Cannot mutate a model instance that is not persisted'

  constructor() {
    super()
  }
}

export class ModelUnknownDeletionStateException extends Exception {
  static code = 'E_MODEL_UNKNOWN_DELETION_STATE'
  static status = 500
  static message =
    'Cannot restore a model without loading deletedAt; select deletedAt or call refresh()'

  constructor() {
    super()
  }
}

export class BulkReceiptRequiresTransactionException extends Exception {
  static code = 'E_BULK_RECEIPT_REQUIRES_TRANSACTION'
  static status = 500
  static message = 'Bulk lifecycle receipts require a caller-owned transaction client'

  constructor() {
    super()
  }
}

export class BulkReceiptUnsupportedException extends Exception {
  static code = 'E_BULK_RECEIPT_UNSUPPORTED'
  static status = 500

  constructor(reason: string) {
    super(`Bulk lifecycle receipts do not support ${reason}`)
  }
}

export class BulkReceiptDivergedException extends Exception {
  static code = 'E_BULK_RECEIPT_DIVERGED'
  static status = 500

  constructor(
    public readonly expected: number,
    public readonly actual: number
  ) {
    super(
      `Bulk lifecycle write changed ${actual} rows but ${expected} were selected; roll back the transaction`
    )
  }
}

export const E_LIFECYCLE_WRITE_UNSUPPORTED = LifecycleWriteUnsupportedException
export const E_MODEL_SOFT_DELETE = ModelSoftDeleteException
export const E_MODEL_FORCE_DELETED = ModelForceDeletedException
export const E_MODEL_NOT_PERSISTED = ModelNotPersistedException
export const E_MODEL_UNKNOWN_DELETION_STATE = ModelUnknownDeletionStateException
export const E_BULK_RECEIPT_REQUIRES_TRANSACTION = BulkReceiptRequiresTransactionException
export const E_BULK_RECEIPT_UNSUPPORTED = BulkReceiptUnsupportedException
export const E_BULK_RECEIPT_DIVERGED = BulkReceiptDivergedException
