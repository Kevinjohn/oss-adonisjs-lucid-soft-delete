/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'
import { test } from '@japa/runner'
import { hasSoftDeletes, SOFT_DELETES } from '../../index.ts'
import type { SoftDeletesModel } from '../../index.ts'

// #region lucid_model_map
const modelsByName = new Map<string, LucidModel>()

function findSoftDeletesModel(name: string): SoftDeletesModel | undefined {
  const model = modelsByName.get(name)
  if (model && hasSoftDeletes(model)) {
    return model
  }
  return undefined
}
// #endregion lucid_model_map

test.group('hasSoftDeletes type narrowing', () => {
  test('narrows unknown to the marker and LucidModel to SoftDeletesModel', ({ expectTypeOf }) => {
    const check = (candidate: unknown, model: LucidModel) => {
      if (hasSoftDeletes(candidate)) {
        expectTypeOf(candidate[SOFT_DELETES]).toEqualTypeOf<true>()
        // @ts-expect-error The marker alone does not establish a Lucid constructor.
        void candidate.query
      }

      if (hasSoftDeletes(model)) {
        expectTypeOf(model).toEqualTypeOf<SoftDeletesModel>()
        void model.query().withTrashed()
      }
    }

    expectTypeOf(check).toBeFunction()
  })

  test('narrows a LucidModel map lookup to SoftDeletesModel', ({ expectTypeOf }) => {
    expectTypeOf(findSoftDeletesModel('User')).toEqualTypeOf<SoftDeletesModel | undefined>()
  })
})
