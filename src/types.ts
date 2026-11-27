/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import type { DateTime } from 'luxon'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { BaseModel } from '@adonisjs/lucid/orm'
import type { SOFT_DELETES } from './guard.ts'

export type {} from './types/querybuilder.ts'

/**
 * Raw driver value of the model's primary key. A bigint from the driver is converted with String().
 * Supported keys are numeric, string and binary; boolean primary keys are not supported.
 */
export type PrimaryKeyValue = number | string | Uint8Array

export interface BulkReceiptOptions {
  /** When true, the method returns the changed primary keys rather than just the count. Requires a caller-owned transaction. */
  receipt?: boolean
}

/** The mutation observed inside the caller's transaction; not durable until it commits. */
export interface BulkReceipt {
  /** Rows the write changed. Equals ids.length. */
  count: number
  /** Primary-key values of the changed rows. Set semantics: no defined order, no duplicates. */
  ids: PrimaryKeyValue[]
}

export type RestoreReceipt = BulkReceipt
export type ForceDeleteReceipt = BulkReceipt

export interface SoftDeleteReceipt extends BulkReceipt {
  /**
   * The instant the written literal denotes in the Node process zone, truncated to the
   * dialect's date-time format precision (milliseconds on PostgreSQL, seconds elsewhere).
   * null when count is 0.
   */
  deletedAt: DateTime | null
}

export type SoftDeletesModel = LucidModel & {
  readonly [SOFT_DELETES]: true
}

/** Instance lifecycle methods and state provided by `withSoftDeletes`. */
export interface SoftDeletesInstance {
  /** Deletion time; null is active, while undefined can mean an omitted projection. */
  deletedAt?: DateTime | null
  /** True when the loaded deletion time is non-null. Does not query the database. */
  readonly trashed: boolean
  /** Used by the instance deletion path; prefer calling forceDelete(). */
  $forceDelete: boolean
  /**
   * Clears the deletion timestamp of a persisted instance through the normal save hooks.
   *
   * @example
   * ```ts
   * await user.restore()
   * ```
   */
  restore(): Promise<this>
  /**
   * Physically deletes the instance.
   *
   * @example
   * ```ts
   * await user.forceDelete()
   * ```
   */
  forceDelete(): Promise<void>
}

/**
 * Static members `withSoftDeletes` adds to the model class. `withTrashed()` and `onlyTrashed()` select
 * a read mode; the other three are the model fetch hooks and their bypass, not application API.
 */
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
  /**
   * Starts a query that includes active and trashed rows.
   *
   * @example
   * ```ts
   * const record = await User.withTrashed().where('id', 42).first()
   * ```
   */
  withTrashed<Model extends LucidModel>(
    this: Model
  ): ModelQueryBuilderContract<Model, InstanceType<Model>>
  /**
   * Starts a query that includes only trashed rows.
   *
   * @example
   * ```ts
   * const record = await User.onlyTrashed().where('id', 42).first()
   * ```
   */
  onlyTrashed<Model extends LucidModel>(
    this: Model
  ): ModelQueryBuilderContract<Model, InstanceType<Model>>
}

/**
 * The class `withSoftDeletes(superclass)` returns: the superclass statics plus `SoftDeletesStatics`,
 * constructing instances with `SoftDeletesInstance` and the overridden Lucid delete methods.
 */
export type SoftDeletesConstructor<T extends NormalizeConstructor<typeof BaseModel>> = Omit<
  T,
  'constructor'
> &
  SoftDeletesStatics & {
    new (...args: any[]): InstanceType<T> &
      SoftDeletesInstance & {
        /**
         * Marks a persisted instance as deleted through the normal model hooks.
         *
         * @example
         * ```ts
         * await user.delete()
         * ```
         */
        delete(): Promise<void>
        /**
         * Marks a persisted instance as deleted without running model hooks.
         *
         * @example
         * ```ts
         * await user.deleteQuietly()
         * ```
         */
        deleteQuietly(): Promise<void>
      }
  }
