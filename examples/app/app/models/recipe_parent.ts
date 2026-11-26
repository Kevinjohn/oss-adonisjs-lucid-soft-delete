/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file distributed with this source code.
 */

// #region RECIPE_PARENT
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import { withSoftDeletes } from '@kevinjohn/adonisjs-lucid-soft-delete'
import RecipeChild from '#models/recipe_child'

export default class RecipeParent extends compose(BaseModel, withSoftDeletes) {
  static table = 'lifecycle_parents'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare label: string
  @column.dateTime() declare archivedAt: DateTime | null
  @hasMany(() => RecipeChild, { foreignKey: 'parentId' }) declare children: HasMany<
    typeof RecipeChild
  >
}
// #endregion RECIPE_PARENT
