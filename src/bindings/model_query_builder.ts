import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

// A standalone binding import also makes the registration visible to TypeScript.
export type {} from '../types/querybuilder.ts'

import type { BulkReceiptOptions } from '../receipts.js'
import {
  requireValidReceiptMode,
  assertReceiptSupported,
  readDeletionTimestamp,
  countAffectedRows,
  executeWithReceipt,
} from '../receipts.js'
import { E_LIFECYCLE_WRITE_UNSUPPORTED, E_MODEL_SOFT_DELETE } from '../errors.js'
import { hasSoftDeletes, type SoftDeletesModel } from '../guard.js'
import { getSoftDeletesMode, setSoftDeletesMode } from '../mode.js'
import { installModePropagation } from '../propagation.js'
import { installSubQueryScope } from '../sub_query_scope.js'
import { qualifyColumnReference } from '../table_reference.js'
import { addScopeFilter, groupCallerPredicates, hasRequiredEquality } from '../where_stack.js'

/**
 * Raises exception when model not with soft delete
 */
function assertSoftDeleteModel(model: LucidModel) {
  if (!hasSoftDeletes(model)) {
    throw new E_MODEL_SOFT_DELETE(model.name)
  }
}

/**
 * Lucid redirects many-to-many writes to the pivot, and builds has-many-through writes with a
 * `select *` sub-query that no supported database accepts.
 */
function assertLifecycleWriteSupported(query: ModelQueryBuilderContract<LucidModel>) {
  assertSoftDeleteModel(query.model)
  if (!query.model.$getColumn('deletedAt')) throw new E_MODEL_SOFT_DELETE(query.model.name)
  const type = (query as unknown as { relation?: { type?: string } }).relation?.type
  if (type === 'manyToMany' || type === 'hasManyThrough') {
    throw new E_LIFECYCLE_WRITE_UNSUPPORTED(
      'many-to-many or has-many-through builders; query the related model by its IDs instead'
    )
  }
}

/**
 * Count mode compiles an update or delete, which PostgreSQL and SQLite run without the limit or
 * offset and MySQL honours. Reject them so the affected rows never depend on the dialect. A
 * has-many builder's `groupLimit()` becomes a plain limit only inside Lucid's `exec()`, so it is
 * read from `groupConstraints` here. A belongs-to builder rendered with `toSQL()` first
 * keeps Lucid's own `limit(1)`. Only allow the limit for a single-parent belongs-to targeting
 * the related model's own table by primary key.
 */
function assertSupportedRowWindow(query: ModelQueryBuilderContract<LucidModel>) {
  const single = (
    query.knexQuery as unknown as {
      _single: { limit?: unknown; offset?: unknown; table?: unknown; schema?: unknown }
    }
  )._single
  const { appliedConstraints, groupConstraints, parent, relation } = query as unknown as {
    appliedConstraints?: boolean
    groupConstraints?: { limit?: unknown }
    parent?: Record<string, unknown> | unknown[]
    relation?: {
      type: string
      localKey: string
      localKeyColumnName: string
      foreignKey: string
    }
  }
  const singleRow =
    single.limit === 1 &&
    relation?.type === 'belongsTo' &&
    relation.localKey === query.model.primaryKey &&
    !!parent &&
    !Array.isArray(parent) &&
    single.table === query.model.table &&
    single.schema === undefined &&
    // Lucid will not reapply the relation constraint after previewing a builder.
    (!appliedConstraints ||
      hasRequiredEquality(query, relation.localKeyColumnName, parent[relation.foreignKey]))
  if (
    (single.limit !== undefined && single.limit !== null && !singleRow) ||
    (single.offset !== undefined && single.offset !== null) ||
    groupConstraints?.limit !== undefined
  ) {
    throw new E_LIFECYCLE_WRITE_UNSUPPORTED('limit, offset or groupLimit clauses')
  }
  return singleRow
}

/**
 * Registers the soft-delete macros and query wrappers on a Lucid model query builder.
 * The package provider calls this during boot. Call it directly for a standalone Lucid setup.
 *
 * @example
 * ```ts
 * import { extendModelQueryBuilder } from '@kevinjohn/adonisjs-lucid-soft-delete/bindings'
 * import { ModelQueryBuilder } from '@adonisjs/lucid/orm'
 *
 * extendModelQueryBuilder(ModelQueryBuilder)
 * ```
 */
export function extendModelQueryBuilder(builder: any) {
  installModePropagation(builder)
  installSubQueryScope(builder)

  builder.macro(
    'restore',
    async function (this: ModelQueryBuilderContract<LucidModel>, options?: BulkReceiptOptions) {
      const receipt = requireValidReceiptMode(options)
      assertLifecycleWriteSupported(this)
      if (receipt) assertReceiptSupported(this)
      else assertSupportedRowWindow(this)
      const column = this.model.$getColumn('deletedAt')!.columnName
      addScopeFilter(this, 'whereNotNull', qualifyColumnReference(this, { column }))
      const write = (target: ModelQueryBuilderContract<LucidModel>) =>
        target.update({ [column]: null })
      if (!receipt) return countAffectedRows(await write(this))
      return executeWithReceipt(this, write)
    }
  )

  builder.macro(
    'softDelete',
    async function (this: ModelQueryBuilderContract<LucidModel>, options?: BulkReceiptOptions) {
      const receipt = requireValidReceiptMode(options)
      assertLifecycleWriteSupported(this)
      if (receipt) assertReceiptSupported(this)
      else assertSupportedRowWindow(this)
      const column = this.model.$getColumn('deletedAt')!.columnName
      if (getSoftDeletesMode(this) === 'only')
        return receipt ? { count: 0, ids: [], deletedAt: null } : 0
      addScopeFilter(this, 'whereNull', qualifyColumnReference(this, { column }))
      const deletedAt = readDeletionTimestamp(this)
      const values = { [column]: deletedAt.toFormat(this.client.dialect.dateTimeFormat) }
      const write = (target: ModelQueryBuilderContract<LucidModel>) => target.update(values)
      if (!receipt) return countAffectedRows(await write(this))
      const { count: affectedRowCount, ids } = await executeWithReceipt(this, write)
      return { count: affectedRowCount, ids, deletedAt: affectedRowCount === 0 ? null : deletedAt }
    }
  )

  builder.macro(
    'forceDelete',
    async function (this: ModelQueryBuilderContract<LucidModel>, options?: BulkReceiptOptions) {
      const receipt = requireValidReceiptMode(options)
      assertLifecycleWriteSupported(this)
      if (receipt) assertReceiptSupported(this)
      else if (assertSupportedRowWindow(this)) this.clearLimit()
      const column = this.model.$getColumn('deletedAt')!.columnName
      if (getSoftDeletesMode(this) === 'only') {
        addScopeFilter(this, 'whereNotNull', qualifyColumnReference(this, { column }))
      } else {
        groupCallerPredicates(this)
      }
      const write = (target: ModelQueryBuilderContract<LucidModel>) => target.delete()
      if (!receipt) return countAffectedRows(await write(this))
      return executeWithReceipt(this, write)
    }
  )

  builder.macro('withTrashed', function (this: ModelQueryBuilderContract<SoftDeletesModel>) {
    assertSoftDeleteModel(this.model)
    return setSoftDeletesMode(this, 'with')
  })

  builder.macro('onlyTrashed', function (this: ModelQueryBuilderContract<SoftDeletesModel>) {
    assertSoftDeleteModel(this.model)

    return setSoftDeletesMode(this, 'only')
  })
}
