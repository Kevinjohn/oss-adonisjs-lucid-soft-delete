/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'

export const SOFT_DELETES = Symbol.for('@kevinjohn/lucid-soft-deletes')

export type SoftDeletesModel = LucidModel & {
  readonly [SOFT_DELETES]: true
}

/**
 * Check the explicit soft-delete capability marker on a model constructor.
 * A `deletedAt` column alone does not guarantee the model has the mixin behavior.
 */
export function hasSoftDeletes(model: unknown): model is SoftDeletesModel {
  if (model === null || (typeof model !== 'object' && typeof model !== 'function')) {
    return false
  }

  return (model as { [SOFT_DELETES]?: unknown })[SOFT_DELETES] === true
}
