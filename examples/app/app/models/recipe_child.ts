/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file distributed with this source code.
 */

// #region RECIPE_CHILD
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { withSoftDeletes } from '@kevinjohn/adonisjs-lucid-soft-delete'

export default class RecipeChild extends compose(BaseModel, withSoftDeletes) {
  static table = 'lifecycle_children'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare parentId: number
  @column() declare label: string
}
// #endregion RECIPE_CHILD
