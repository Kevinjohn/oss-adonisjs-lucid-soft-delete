/*
 * adonis-lucid-soft-deletes
 *
 * (c) Lookin Anton <alsd@lookinlab.ru>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { DateTime } from 'luxon'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { Exception } from '@adonisjs/core/exceptions'
import { column, beforeFind, beforeFetch, beforePaginate } from '@adonisjs/lucid/orm'
import type { BaseModel } from '@adonisjs/lucid/orm'
import { applyScope, getSoftDeletesMode, setSoftDeletesMode } from './scope.js'

type ModelQueryBuilderContractWithIgnoreDeleted<
  T extends LucidModel,
  R = InstanceType<T>,
> = ModelQueryBuilderContract<T, R> & {
  softDeletesMode?: 'default' | 'with' | 'only'
}

export function SoftDeletes<T extends NormalizeConstructor<typeof BaseModel>>(superclass: T) {
  class ModelWithSoftDeletes extends superclass {
    declare static $hooks: LucidModel['$hooks']

    @beforeFind()
    @beforeFetch()
    static ignoreDeleted<Model extends typeof ModelWithSoftDeletes>(
      query: ModelQueryBuilderContractWithIgnoreDeleted<Model, InstanceType<Model>>
    ): void {
      applyScope(query)
    }

    @beforePaginate()
    static ignoreDeletedPaginate<Model extends typeof ModelWithSoftDeletes>([countQuery, query]: [
      ModelQueryBuilderContractWithIgnoreDeleted<Model, InstanceType<Model>>,
      ModelQueryBuilderContractWithIgnoreDeleted<Model, InstanceType<Model>>,
    ]): void {
      setSoftDeletesMode(countQuery, getSoftDeletesMode(query))
      this.ignoreDeleted(countQuery)
    }

    static disableIgnore<Model extends typeof ModelWithSoftDeletes, Result = InstanceType<Model>>(
      this: Model,
      query: ModelQueryBuilderContractWithIgnoreDeleted<Model, Result>
    ): ModelQueryBuilderContractWithIgnoreDeleted<Model, Result> {
      return setSoftDeletesMode(query, 'with')
    }

    /**
     * Fetch all models without filter by deleted_at
     */
    static withTrashed<Model extends typeof ModelWithSoftDeletes>(
      this: Model
    ): ModelQueryBuilderContractWithIgnoreDeleted<Model, InstanceType<T>> {
      const query = this.query() as ModelQueryBuilderContractWithIgnoreDeleted<
        Model,
        InstanceType<Model>
      >
      return this.disableIgnore(query)
    }

    /**
     * Fetch models only with deleted_at
     */
    static onlyTrashed<Model extends typeof ModelWithSoftDeletes>(
      this: Model
    ): ModelQueryBuilderContractWithIgnoreDeleted<Model, InstanceType<Model>> {
      const query = this.query() as ModelQueryBuilderContractWithIgnoreDeleted<
        Model,
        InstanceType<Model>
      >

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
      return this.deletedAt !== null
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
      const softDelete = async (): Promise<void> => {
        this.deletedAt = DateTime.local()
        await this.save()
      }

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
      await super.delete()
      this.$isDeleted = this.$forceDelete
    }

    /**
     * Restore model
     */
    async restore(): Promise<this> {
      if (this.$isDeleted) {
        throw new Exception('Cannot restore a model instance is was force deleted', {
          code: 'E_MODEL_FORCE_DELETED',
          status: 500,
        })
      }
      if (!this.trashed) {
        return this
      }
      this.deletedAt = null
      await this.save()

      return this
    }

    /**
     * Force delete model
     */
    async forceDelete(): Promise<void> {
      this.$forceDelete = true
      await this.delete()
    }
  }
  return ModelWithSoftDeletes
}
