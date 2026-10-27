/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2024 Lookin Anton <alsd@lookinlab.ru>
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { SoftDeletesModel } from '../guard.js'

declare module '@adonisjs/lucid/types/model' {
  export interface ModelQueryBuilderContract<
    Model extends LucidModel,
    Result = InstanceType<Model>,
  > {
    withTrashed(this: { model: SoftDeletesModel }): this
    onlyTrashed(this: { model: SoftDeletesModel }): this
    restore(this: { model: SoftDeletesModel }): Promise<number>
    softDelete(this: { model: SoftDeletesModel }): Promise<number>
    forceDelete(this: { model: SoftDeletesModel }): Promise<number>
  }
}

declare module '@adonisjs/lucid/orm' {
  export interface ModelQueryBuilder {
    withTrashed(this: this & { model: SoftDeletesModel }): this
    onlyTrashed(this: this & { model: SoftDeletesModel }): this
    restore(this: this & { model: SoftDeletesModel }): Promise<number>
    softDelete(this: this & { model: SoftDeletesModel }): Promise<number>
    forceDelete(this: this & { model: SoftDeletesModel }): Promise<number>
  }
}

export {}
