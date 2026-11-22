/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'

export const SOFT_DELETES = Symbol.for('@kevinjohn/adonisjs-lucid-soft-delete')

export type SoftDeletesModel = LucidModel & {
  readonly [SOFT_DELETES]: true
}

/**
 * Reports whether a value carries the soft-delete marker that the `SoftDeletes` mixin sets. A value
 * typed as a Lucid model narrows to `SoftDeletesModel`; any other value gains only the marker, so a
 * true result does not prove a Lucid model, and a plain object carrying the marker also passes. A
 * `deletedAt` column alone does not set the marker.
 */
export function hasSoftDeletes<Model>(
  model: Model
): model is Model & Pick<SoftDeletesModel, typeof SOFT_DELETES> {
  if (model === null || (typeof model !== 'object' && typeof model !== 'function')) {
    return false
  }

  return (model as { [SOFT_DELETES]?: unknown })[SOFT_DELETES] === true
}
