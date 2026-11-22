/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

/** Compile-time contracts for the `hasSoftDeletes` type guard. */

import type { LucidModel } from '@adonisjs/lucid/types/model'
import { hasSoftDeletes, SOFT_DELETES } from '../../index.js'
import type { SoftDeletesModel } from '../../index.js'

export function assertGuardTypeContracts(candidate: unknown, model: LucidModel): void {
  if (hasSoftDeletes(candidate)) {
    const marker: true = candidate[SOFT_DELETES]
    void marker
    // @ts-expect-error The marker alone does not establish a Lucid constructor.
    void candidate.query
  }

  if (hasSoftDeletes(model)) {
    const capable: SoftDeletesModel = model
    void capable.query().withTrashed()
  }
}

// #region lucid_model_registry
const registry = new Map<string, LucidModel>()

export function findSoftDeletesModel(name: string): SoftDeletesModel | undefined {
  const model = registry.get(name)
  if (model && hasSoftDeletes(model)) {
    return model
  }
  return undefined
}
// #endregion lucid_model_registry
