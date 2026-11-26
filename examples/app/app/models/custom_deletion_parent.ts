/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file distributed with this source code.
 */

// #region CUSTOM_DELETION_PARENT
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import { withSoftDeletes } from '@kevinjohn/adonisjs-lucid-soft-delete'

export default class CustomDeletionParent extends compose(BaseModel, withSoftDeletes) {
  static table = 'lifecycle_parents'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare label: string
  @column.dateTime({
    columnName: 'archived_at',
    serialize: (value: DateTime | null) => value?.toUTC().toISO() ?? null,
  })
  declare deletedAt: DateTime | null
}
// #endregion CUSTOM_DELETION_PARENT
