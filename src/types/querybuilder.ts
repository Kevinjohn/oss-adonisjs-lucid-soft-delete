/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2024 Lookin Anton <alsd@lookinlab.ru>
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type {
  BulkReceiptOptions,
  ForceDeleteReceipt,
  RestoreReceipt,
  SoftDeleteReceipt,
} from '../receipts.js'
import type { SoftDeletesModel } from '../guard.js'

declare module '@adonisjs/lucid/types/model' {
  export interface ModelQueryBuilderContract<
    Model extends LucidModel,
    Result = InstanceType<Model>,
  > {
    withTrashed(this: { model: SoftDeletesModel }): this
    onlyTrashed(this: { model: SoftDeletesModel }): this
    restore(this: { model: SoftDeletesModel }, options?: { receipt?: false }): Promise<number>
    restore(this: { model: SoftDeletesModel }, options: { receipt: true }): Promise<RestoreReceipt>
    restore(
      this: { model: SoftDeletesModel },
      options: BulkReceiptOptions
    ): Promise<number | RestoreReceipt>
    softDelete(this: { model: SoftDeletesModel }, options?: { receipt?: false }): Promise<number>
    softDelete(
      this: { model: SoftDeletesModel },
      options: { receipt: true }
    ): Promise<SoftDeleteReceipt>
    softDelete(
      this: { model: SoftDeletesModel },
      options: BulkReceiptOptions
    ): Promise<number | SoftDeleteReceipt>
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
    withTrashed(this: this & { model: SoftDeletesModel }): this
    onlyTrashed(this: this & { model: SoftDeletesModel }): this
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
