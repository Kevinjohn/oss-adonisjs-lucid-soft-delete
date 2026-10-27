/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Exception } from '@adonisjs/core/exceptions'

class ModelSoftDeleteException extends Exception {
  static code = 'E_MODEL_SOFT_DELETE'
  static status = 500

  constructor(modelName: string) {
    super(`${modelName} does not use SoftDeletes`, {
      code: ModelSoftDeleteException.code,
      status: ModelSoftDeleteException.status,
    })
  }
}

class ModelForceDeletedException extends Exception {
  static code = 'E_MODEL_FORCE_DELETED'
  static status = 500

  constructor() {
    super('Cannot restore a model instance that was force deleted', {
      code: ModelForceDeletedException.code,
      status: ModelForceDeletedException.status,
    })
  }
}

class ModelNotPersistedException extends Exception {
  static code = 'E_MODEL_NOT_PERSISTED'
  static status = 500

  constructor() {
    super('Cannot mutate a model instance that is not persisted', {
      code: ModelNotPersistedException.code,
      status: ModelNotPersistedException.status,
    })
  }
}

class ModelUnknownDeletionStateException extends Exception {
  static code = 'E_MODEL_UNKNOWN_DELETION_STATE'
  static status = 500

  constructor() {
    super('Cannot restore a model without loading deletedAt; select deletedAt or call refresh()', {
      code: ModelUnknownDeletionStateException.code,
      status: ModelUnknownDeletionStateException.status,
    })
  }
}

class BulkReceiptRequiresTransactionException extends Exception {
  static code = 'E_BULK_RECEIPT_REQUIRES_TRANSACTION'
  static status = 500

  constructor() {
    super('Bulk lifecycle receipts require a caller-owned transaction client', {
      code: BulkReceiptRequiresTransactionException.code,
      status: BulkReceiptRequiresTransactionException.status,
    })
  }
}

class BulkReceiptUnsupportedException extends Exception {
  static code = 'E_BULK_RECEIPT_UNSUPPORTED'
  static status = 500

  constructor(reason: string) {
    super(`Bulk lifecycle receipts do not support ${reason}`, {
      code: BulkReceiptUnsupportedException.code,
      status: BulkReceiptUnsupportedException.status,
    })
  }
}

class BulkReceiptDivergedException extends Exception {
  static code = 'E_BULK_RECEIPT_DIVERGED'
  static status = 500

  constructor(
    public readonly expected: number,
    public readonly actual: number
  ) {
    super(
      `Bulk lifecycle write changed ${actual} rows but ${expected} were selected; roll back the transaction`,
      {
        code: BulkReceiptDivergedException.code,
        status: BulkReceiptDivergedException.status,
      }
    )
  }
}

export {
  BulkReceiptRequiresTransactionException as E_BULK_RECEIPT_REQUIRES_TRANSACTION,
  BulkReceiptUnsupportedException as E_BULK_RECEIPT_UNSUPPORTED,
  BulkReceiptDivergedException as E_BULK_RECEIPT_DIVERGED,
  ModelSoftDeleteException as E_MODEL_SOFT_DELETE,
  ModelForceDeletedException as E_MODEL_FORCE_DELETED,
  ModelNotPersistedException as E_MODEL_NOT_PERSISTED,
  ModelUnknownDeletionStateException as E_MODEL_UNKNOWN_DELETION_STATE,
}
