import { DateTime } from 'luxon'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { column, beforeFind, beforeFetch, beforePaginate } from '@adonisjs/lucid/orm'
import type { BaseModel } from '@adonisjs/lucid/orm'
import { getSoftDeletesMode, setSoftDeletesMode } from './mode.ts'
import { applyScope } from './scope.ts'
import {
  E_MODEL_FORCE_DELETED,
  E_MODEL_NOT_PERSISTED,
  E_MODEL_UNKNOWN_DELETION_STATE,
} from './errors.ts'
import { SOFT_DELETES } from './guard.ts'
import type { SoftDeletesConstructor } from './types.ts'

/** Restore the previous value only when Lucid did not complete its write. */
async function persistDeletedAt(
  model: InstanceType<typeof BaseModel> & { deletedAt?: DateTime | null },
  { deletedAt, skipHooks = false }: { deletedAt: DateTime | null; skipHooks?: boolean }
): Promise<void> {
  const previous = model.deletedAt
  const hadDeletedAt = Object.hasOwn(model.$attributes, 'deletedAt')
  const hadOwnDeletedAt = Object.hasOwn(model, 'deletedAt')
  const originalsBeforeSave = model.$original
  model.deletedAt = deletedAt
  try {
    if (skipHooks) await model.saveQuietly()
    else await model.save()
  } catch (error) {
    if (model.$original === originalsBeforeSave) {
      if (hadDeletedAt || hadOwnDeletedAt) model.deletedAt = previous
      if (!hadDeletedAt) delete model.$attributes.deletedAt
      if (!hadOwnDeletedAt) delete model.deletedAt
    }
    throw error
  }
}

type DeleteOperation = 'physical' | 'skip' | 'soft'

/** Shared delete decision for `delete()` and `deleteQuietly()`. Throws for a model that was never saved. */
async function resolveDeleteOperation(
  model: InstanceType<typeof BaseModel> & { $forceDelete: boolean; trashed: boolean }
): Promise<DeleteOperation> {
  if (!model.$isPersisted) throw new E_MODEL_NOT_PERSISTED()
  if (model.$isDeleted || model.$forceDelete) return 'physical'
  if (model.trashed && !('deletedAt' in model.$dirty)) return 'skip'
  if (!model.$isLocal && !('deletedAt' in model.$attributes)) {
    const Model = model.constructor as typeof BaseModel
    const client = Model.$adapter.modelClient(model)
    const deletedAtColumn = Model.$getColumn('deletedAt')!.columnName
    const primaryKeyColumn = Model.$getColumn(Model.primaryKey)?.columnName ?? Model.primaryKey
    const primaryKeyValue = Model.selfAssignPrimaryKey
      ? model.$original[Model.primaryKey]
      : model.$primaryKeyValue
    const row = await client
      .getWriteClient()(Model.table)
      .select(deletedAtColumn)
      .where(primaryKeyColumn, primaryKeyValue)
      .first()
    if (row?.[deletedAtColumn] !== null && row?.[deletedAtColumn] !== undefined) return 'skip'
  }
  return 'soft'
}

type ScopedModelQueryBuilder<
  Model extends LucidModel,
  Result = InstanceType<Model>,
> = ModelQueryBuilderContract<Model, Result> & { softDeletesMode?: 'default' | 'with' | 'only' }

/**
 * Composes a Lucid model with the soft-delete lifecycle and read filter.
 * Model fetch hooks exclude deleted rows by default. Register the provider for the
 * builder macros and prototype wrappers. Applications own authorisation and transactions.
 *
 * @example
 * ```ts
 * import { withSoftDeletes } from '@kevinjohn/adonisjs-lucid-soft-delete'
 * import { compose } from '@adonisjs/core/helpers'
 * import { UserSchema } from '#database/schema'
 *
 * export default class User extends compose(UserSchema, withSoftDeletes) {}
 * ```
 */
export function withSoftDeletes<T extends NormalizeConstructor<typeof BaseModel>>(
  superclass: T
): SoftDeletesConstructor<T> {
  class ModelWithSoftDeletes extends superclass {
    declare static $hooks: LucidModel['$hooks']
    static [SOFT_DELETES] = true as const

    @beforeFind()
    @beforeFetch()
    static ignoreDeleted<Model extends typeof ModelWithSoftDeletes>(
      query: ScopedModelQueryBuilder<Model, InstanceType<Model>>
    ): void {
      applyScope(query)
    }

    @beforePaginate()
    static ignoreDeletedPaginate<Model extends typeof ModelWithSoftDeletes>([countQuery, query]: [
      ScopedModelQueryBuilder<Model, InstanceType<Model>>,
      ScopedModelQueryBuilder<Model, InstanceType<Model>>,
    ]): void {
      setSoftDeletesMode(countQuery, getSoftDeletesMode(query))
      this.ignoreDeleted(countQuery)
    }

    static disableIgnore<Model extends typeof ModelWithSoftDeletes, Result = InstanceType<Model>>(
      this: Model,
      query: ScopedModelQueryBuilder<Model, Result>
    ): ScopedModelQueryBuilder<Model, Result> {
      return setSoftDeletesMode(query, 'with')
    }

    /**
     * Fetch all models without filter by deleted_at
     */
    static withTrashed<Model extends typeof ModelWithSoftDeletes>(
      this: Model
    ): ScopedModelQueryBuilder<Model, InstanceType<Model>> {
      const query = this.query() as ScopedModelQueryBuilder<Model, InstanceType<Model>>
      return this.disableIgnore(query)
    }

    /**
     * Fetch models only with deleted_at
     */
    static onlyTrashed<Model extends typeof ModelWithSoftDeletes>(
      this: Model
    ): ScopedModelQueryBuilder<Model, InstanceType<Model>> {
      const query = this.query() as ScopedModelQueryBuilder<Model, InstanceType<Model>>

      return setSoftDeletesMode(query, 'only')
    }

    /**
     * Force delete instance property
     */
    $forceDelete = false

    /**
     * Soft deleted property
     */
    @column.dateTime()
    declare deletedAt?: DateTime | null

    /**
     * Computed trashed property
     */
    get trashed(): boolean {
      return this.deletedAt !== null && this.deletedAt !== undefined
    }

    /**
     * Override default $getQueryFor method
     */
    $getQueryFor(
      action: 'insert' | 'update' | 'delete' | 'refresh',
      client: QueryClientContract
    ): any {
      /**
       * Soft Delete
       */
      const softDelete = (): Promise<void> =>
        persistDeletedAt(this, { deletedAt: DateTime.local() })

      if (action === 'delete' && !this.$forceDelete) {
        return { del: softDelete, delete: softDelete }
      }
      if (action === 'insert') return super.$getQueryFor(action, client)
      const query = super.$getQueryFor(action, client)
      return action === 'refresh' ? setSoftDeletesMode(query, 'with') : query
    }

    /**
     * Override default delete method
     */
    async delete(): Promise<void> {
      const operation = await resolveDeleteOperation(this)
      if (operation === 'skip') return
      if (operation === 'physical') return super.delete()
      try {
        await super.delete()
      } finally {
        this.$isDeleted = false
      }
    }

    async deleteQuietly(): Promise<void> {
      const operation = await resolveDeleteOperation(this)
      if (operation === 'skip') return
      if (operation === 'physical') return super.deleteQuietly()
      await persistDeletedAt(this, { deletedAt: DateTime.local(), skipHooks: true })
    }

    /**
     * Restore model
     */
    async restore(): Promise<this> {
      if (!this.$isPersisted) throw new E_MODEL_NOT_PERSISTED()
      if (this.$isDeleted) {
        throw new E_MODEL_FORCE_DELETED()
      }
      if (!this.$isLocal && !('deletedAt' in this.$attributes)) {
        throw new E_MODEL_UNKNOWN_DELETION_STATE()
      }
      if (!this.trashed) {
        return this
      }
      await persistDeletedAt(this, { deletedAt: null })

      return this
    }

    /**
     * Force delete model
     */
    async forceDelete(): Promise<void> {
      const previous = this.$forceDelete
      this.$forceDelete = true
      try {
        await this.delete()
      } finally {
        this.$forceDelete = previous
      }
    }
  }
  return ModelWithSoftDeletes as unknown as SoftDeletesConstructor<T>
}
