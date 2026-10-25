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
import { column, beforeFind, beforeFetch, beforePaginate } from '@adonisjs/lucid/orm'
import type { BaseModel } from '@adonisjs/lucid/orm'
import { applyScope, getSoftDeletesMode, setSoftDeletesMode } from './scope.js'
import { E_MODEL_FORCE_DELETED, E_MODEL_NOT_PERSISTED } from './errors.js'

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
      return this.deletedAt !== null && this.deletedAt !== undefined
    }

    /** Keep the instance aligned with a write that completed before a later hook failed. */
    async persistDeletedAt(value: DateTime | null, quietly = false): Promise<void> {
      const previous = this.deletedAt
      this.deletedAt = value
      try {
        if (quietly) await this.saveQuietly()
        else await this.save()
      } catch (error) {
        const original = this.$original.deletedAt
        const persisted =
          value === null
            ? original === null
            : DateTime.isDateTime(original) && original.equals(value)
        if (!persisted) this.deletedAt = previous
        throw error
      }
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
      const softDelete = (): Promise<void> => this.persistDeletedAt(DateTime.local())

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
      await this.persistDeletedAt(DateTime.local(), true)
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
      await this.persistDeletedAt(null)

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
  return ModelWithSoftDeletes
}
