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
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { column, beforeFind, beforeFetch, beforePaginate } from '@adonisjs/lucid/orm'
import type { BaseModel } from '@adonisjs/lucid/orm'
import { applyScope, getSoftDeletesMode, setSoftDeletesMode } from './scope.js'
import { E_MODEL_FORCE_DELETED, E_MODEL_NOT_PERSISTED } from './errors.js'
import { SOFT_DELETES } from './guard.js'

export interface SoftDeletesInstance {
  deletedAt?: DateTime | null
  readonly trashed: boolean
  $forceDelete: boolean
  restore(): Promise<this>
  forceDelete(): Promise<void>
}

/** Restore the previous value only when Lucid did not complete its write. */
async function persistDeletedAt(
  model: InstanceType<typeof BaseModel> & { deletedAt?: DateTime | null },
  value: DateTime | null,
  quietly = false
): Promise<void> {
  const previous = model.deletedAt
  const originalsBeforeSave = model.$original
  model.deletedAt = value
  try {
    if (quietly) await model.saveQuietly()
    else await model.save()
  } catch (error) {
    if (model.$original === originalsBeforeSave) model.deletedAt = previous
    throw error
  }
}

export interface SoftDeletesStatics {
  readonly [SOFT_DELETES]: true
  ignoreDeleted<Model extends LucidModel>(query: ModelQueryBuilderContract<Model>): void
  ignoreDeletedPaginate<Model extends LucidModel>(
    queries: [ModelQueryBuilderContract<Model>, ModelQueryBuilderContract<Model>]
  ): void
  disableIgnore<Model extends LucidModel, Result>(
    this: Model,
    query: ModelQueryBuilderContract<Model, Result>
  ): ModelQueryBuilderContract<Model, Result>
  withTrashed<Model extends LucidModel>(
    this: Model
  ): ModelQueryBuilderContract<Model, InstanceType<Model>>
  onlyTrashed<Model extends LucidModel>(
    this: Model
  ): ModelQueryBuilderContract<Model, InstanceType<Model>>
}

export type SoftDeletesConstructor<T extends NormalizeConstructor<typeof BaseModel>> = Omit<
  T,
  'constructor'
> &
  SoftDeletesStatics & {
    new (...args: any[]): InstanceType<T> & SoftDeletesInstance
  }

type ScopedModelQueryBuilder<
  Model extends LucidModel,
  Result = InstanceType<Model>,
> = ModelQueryBuilderContract<Model, Result> & { softDeletesMode?: 'default' | 'with' | 'only' }

export function SoftDeletes<T extends NormalizeConstructor<typeof BaseModel>>(
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
      const softDelete = (): Promise<void> => persistDeletedAt(this, DateTime.local())

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
      if (!this.$isPersisted) throw new E_MODEL_NOT_PERSISTED()
      if (this.$isDeleted) return super.delete()
      if (this.$forceDelete) {
        await super.delete()
        return
      }
      if (this.trashed && !('deletedAt' in this.$dirty)) return
      try {
        await super.delete()
      } finally {
        this.$isDeleted = false
      }
    }

    async deleteQuietly(): Promise<void> {
      if (!this.$isPersisted) throw new E_MODEL_NOT_PERSISTED()
      if (this.$isDeleted) return super.deleteQuietly()
      if (this.$forceDelete) {
        await super.deleteQuietly()
        return
      }
      if (this.trashed && !('deletedAt' in this.$dirty)) return
      await persistDeletedAt(this, DateTime.local(), true)
    }

    /**
     * Restore model
     */
    async restore(): Promise<this> {
      if (this.$isDeleted) {
        throw new E_MODEL_FORCE_DELETED()
      }
      if (!this.trashed) {
        return this
      }
      await persistDeletedAt(this, null)

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
