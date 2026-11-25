import type {
  BulkReceiptOptions,
  ForceDeleteReceipt,
  RestoreReceipt,
  SoftDeleteReceipt,
} from '../receipts.ts'
import type { SoftDeletesModel } from '../guard.ts'

declare module '@adonisjs/lucid/types/model' {
  export interface ModelQueryBuilderContract<
    Model extends LucidModel,
    Result = InstanceType<Model>,
  > {
    /**
     * Includes active and trashed rows in this query.
     *
     * @example
     * ```ts
     * const users = await query.withTrashed().exec()
     * ```
     */
    withTrashed(this: { model: SoftDeletesModel }): this
    /**
     * Includes only trashed rows in this query.
     *
     * @example
     * ```ts
     * const users = await query.onlyTrashed().exec()
     * ```
     */
    onlyTrashed(this: { model: SoftDeletesModel }): this
    /**
     * Restores matching trashed rows without model hooks.
     *
     * @example
     * ```ts
     * const count = await query.where('id', 42).restore()
     * ```
     */
    restore(this: { model: SoftDeletesModel }, options?: { receipt?: false }): Promise<number>
    restore(this: { model: SoftDeletesModel }, options: { receipt: true }): Promise<RestoreReceipt>
    restore(
      this: { model: SoftDeletesModel },
      options: BulkReceiptOptions
    ): Promise<number | RestoreReceipt>
    /**
     * Marks matching active rows as deleted without model hooks.
     *
     * @example
     * ```ts
     * const count = await query.where('id', 42).softDelete()
     * ```
     */
    softDelete(this: { model: SoftDeletesModel }, options?: { receipt?: false }): Promise<number>
    softDelete(
      this: { model: SoftDeletesModel },
      options: { receipt: true }
    ): Promise<SoftDeleteReceipt>
    softDelete(
      this: { model: SoftDeletesModel },
      options: BulkReceiptOptions
    ): Promise<number | SoftDeleteReceipt>
    /**
     * Physically deletes matching rows without model hooks.
     *
     * @example
     * ```ts
     * const count = await query.onlyTrashed().where('id', 42).forceDelete()
     * ```
     */
    forceDelete(this: { model: SoftDeletesModel }, options?: { receipt?: false }): Promise<number>
    forceDelete(
      this: { model: SoftDeletesModel },
      options: { receipt: true }
    ): Promise<ForceDeleteReceipt>
    forceDelete(
      this: { model: SoftDeletesModel },
      options: BulkReceiptOptions
    ): Promise<number | ForceDeleteReceipt>
  }
}

declare module '@adonisjs/lucid/orm' {
  export interface ModelQueryBuilder {
    /**
     * Includes active and trashed rows in this query.
     *
     * @example
     * ```ts
     * const users = await query.withTrashed().exec()
     * ```
     */
    withTrashed(this: this & { model: SoftDeletesModel }): this
    /**
     * Includes only trashed rows in this query.
     *
     * @example
     * ```ts
     * const users = await query.onlyTrashed().exec()
     * ```
     */
    onlyTrashed(this: this & { model: SoftDeletesModel }): this
    /**
     * Restores matching trashed rows without model hooks.
     *
     * @example
     * ```ts
     * const count = await query.where('id', 42).restore()
     * ```
     */
    restore(
      this: this & { model: SoftDeletesModel },
      options?: { receipt?: false }
    ): Promise<number>
    restore(
      this: this & { model: SoftDeletesModel },
      options: { receipt: true }
    ): Promise<RestoreReceipt>
    restore(
      this: this & { model: SoftDeletesModel },
      options: BulkReceiptOptions
    ): Promise<number | RestoreReceipt>
    /**
     * Marks matching active rows as deleted without model hooks.
     *
     * @example
     * ```ts
     * const count = await query.where('id', 42).softDelete()
     * ```
     */
    softDelete(
      this: this & { model: SoftDeletesModel },
      options?: { receipt?: false }
    ): Promise<number>
    softDelete(
      this: this & { model: SoftDeletesModel },
      options: { receipt: true }
    ): Promise<SoftDeleteReceipt>
    softDelete(
      this: this & { model: SoftDeletesModel },
      options: BulkReceiptOptions
    ): Promise<number | SoftDeleteReceipt>
    /**
     * Physically deletes matching rows without model hooks.
     *
     * @example
     * ```ts
     * const count = await query.onlyTrashed().where('id', 42).forceDelete()
     * ```
     */
    forceDelete(
      this: this & { model: SoftDeletesModel },
      options?: { receipt?: false }
    ): Promise<number>
    forceDelete(
      this: this & { model: SoftDeletesModel },
      options: { receipt: true }
    ): Promise<ForceDeleteReceipt>
    forceDelete(
      this: this & { model: SoftDeletesModel },
      options: BulkReceiptOptions
    ): Promise<number | ForceDeleteReceipt>
  }
}

export {}
