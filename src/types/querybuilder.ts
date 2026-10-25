/*
 * adonis-lucid-soft-deletes
 *
 * (c) Lookin Anton <alsd@lookinlab.ru>
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
    withTrashed(
      this: Model extends SoftDeletesModel ? ModelQueryBuilderContract<Model, Result> : never
    ): this
    onlyTrashed(
      this: Model extends SoftDeletesModel ? ModelQueryBuilderContract<Model, Result> : never
    ): this
    restore(
      this: Model extends SoftDeletesModel ? ModelQueryBuilderContract<Model, Result> : never
    ): Promise<number>
  }
}

declare module '@adonisjs/lucid/orm' {
  export interface ModelQueryBuilder {
    withTrashed(this: this & { model: SoftDeletesModel }): this
    onlyTrashed(this: this & { model: SoftDeletesModel }): this
    restore(this: this & { model: SoftDeletesModel }): Promise<number>
  }
}

export {}
