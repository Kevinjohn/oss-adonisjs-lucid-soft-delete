/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2024 Lookin Anton <alsd@lookinlab.ru>
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { DateTime } from 'luxon'

import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

import { E_MODEL_SOFT_DELETE } from '../errors.js'
import { hasSoftDeletes, type SoftDeletesModel } from '../guard.js'
import { getSoftDeletesMode, setSoftDeletesMode } from '../mode.js'
import { installModePropagation } from '../propagation.js'
import { installSubQueryScope } from '../sub_query_scope.js'
import { resolveTableReference } from '../table_reference.js'
import { addScopeFilter, removeScopeFilter } from '../where_stack.js'

/**
 * Raises exception when model not with soft delete
 */
function ensureModelWithSoftDeletes(model: LucidModel) {
  if (!hasSoftDeletes(model)) {
    throw new E_MODEL_SOFT_DELETE(model.name)
  }
}

/**
 * Lucid redirects many-to-many writes to the pivot, and builds has-many-through writes with a
 * `select *` sub-query that no supported database accepts.
 */
function ensureLifecycleWrite(query: ModelQueryBuilderContract<LucidModel>) {
  ensureModelWithSoftDeletes(query.model)
  if (!query.model.$getColumn('deletedAt')) throw new E_MODEL_SOFT_DELETE(query.model.name)
  const type = (query as unknown as { relation?: { type?: string } }).relation?.type
  if (type === 'manyToMany' || type === 'hasManyThrough') {
    throw new Error(
      'Bulk lifecycle writes do not support many-to-many or has-many-through builders; query the related model by its IDs instead'
    )
  }
}

/**
 * Define SoftDeletes binding to ModelQueryBuilder
 */
export function extendModelQueryBuilder(builder: any) {
  installModePropagation(builder)
  installSubQueryScope(builder)

  builder.macro('restore', async function (this: ModelQueryBuilderContract<LucidModel>) {
    ensureLifecycleWrite(this)
    const deletedAtColumn = this.model.$getColumn('deletedAt')!.columnName
    addScopeFilter(this, 'whereNotNull', `${resolveTableReference(this)}.${deletedAtColumn}`)
    const result = await this.update({ [deletedAtColumn]: null })
    return typeof result[0] === 'number' ? result[0] : result.length
  })

  builder.macro('softDelete', async function (this: ModelQueryBuilderContract<LucidModel>) {
    ensureLifecycleWrite(this)
    const column = this.model.$getColumn('deletedAt')!.columnName
    if (getSoftDeletesMode(this) === 'only') return 0
    addScopeFilter(this, 'whereNull', `${resolveTableReference(this)}.${column}`)
    const result = await this.update({
      [column]: DateTime.local().toFormat(this.client.dialect.dateTimeFormat),
    })
    return typeof result[0] === 'number' ? result[0] : result.length
  })

  builder.macro('forceDelete', async function (this: ModelQueryBuilderContract<LucidModel>) {
    ensureLifecycleWrite(this)
    const column = this.model.$getColumn('deletedAt')!.columnName
    if (getSoftDeletesMode(this) === 'only') {
      addScopeFilter(this, 'whereNotNull', `${resolveTableReference(this)}.${column}`)
    } else {
      removeScopeFilter(this)
    }
    const result = await this.delete()
    return typeof result[0] === 'number' ? result[0] : result.length
  })

  builder.macro('withTrashed', function (this: ModelQueryBuilderContract<SoftDeletesModel>) {
    ensureModelWithSoftDeletes(this.model)
    return setSoftDeletesMode(this, 'with')
  })

  builder.macro('onlyTrashed', function (this: ModelQueryBuilderContract<SoftDeletesModel>) {
    ensureModelWithSoftDeletes(this.model)

    return setSoftDeletesMode(this, 'only')
  })
}
