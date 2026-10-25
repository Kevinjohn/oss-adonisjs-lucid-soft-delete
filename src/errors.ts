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
    super('Cannot soft delete a model instance that is not persisted', {
      code: ModelNotPersistedException.code,
      status: ModelNotPersistedException.status,
    })
  }
}

export {
  ModelSoftDeleteException as E_MODEL_SOFT_DELETE,
  ModelForceDeletedException as E_MODEL_FORCE_DELETED,
  ModelNotPersistedException as E_MODEL_NOT_PERSISTED,
}
