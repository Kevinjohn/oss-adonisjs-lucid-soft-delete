/*
 * adonis-lucid-soft-deletes
 *
 * (c) Lookin Anton <alsd@lookinlab.ru>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type {
  LucidModel,
  ModelQueryBuilderContract,
  ModelWithSoftDeletes,
} from '@adonisjs/lucid/types/model'

import { E_MODEL_SOFT_DELETE } from '../errors.js'
import { installModePropagation, resolveTableReference, setSoftDeletesMode } from '../scope.js'

/**
 * Raises exception when model not with soft delete
 */
function ensureModelWithSoftDeletes(model: LucidModel) {
  if (!('ignoreDeleted' in model && 'ignoreDeletedPaginate' in model)) {
    throw new E_MODEL_SOFT_DELETE(model.name)
  }
}

/**
 * Define SoftDeletes binding to ModelQueryBuilder
 */
export function extendModelQueryBuilder(builder: any) {
  installModePropagation(builder)

  builder.macro('restore', async function (this: ModelQueryBuilderContract<LucidModel>) {
    ensureModelWithSoftDeletes(this.model)

    const deletedAtColumn = this.model.$getColumn('deletedAt')?.columnName
    if (!deletedAtColumn) throw new E_MODEL_SOFT_DELETE(this.model.name)

    this.wrapExisting()
    this.whereNotNull(`${resolveTableReference(this)}.${deletedAtColumn}`)
    const result = await this.update({ [deletedAtColumn]: null })
    return typeof result[0] === 'number' ? result[0] : result.length
  })

  builder.macro('withTrashed', function (this: ModelQueryBuilderContract<ModelWithSoftDeletes>) {
    ensureModelWithSoftDeletes(this.model)
    return setSoftDeletesMode(this, 'with')
  })

  builder.macro('onlyTrashed', function (this: ModelQueryBuilderContract<ModelWithSoftDeletes>) {
    ensureModelWithSoftDeletes(this.model)

    return setSoftDeletesMode(this, 'only')
  })
}
