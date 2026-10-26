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

export { ModelSoftDeleteException as E_MODEL_SOFT_DELETE }
