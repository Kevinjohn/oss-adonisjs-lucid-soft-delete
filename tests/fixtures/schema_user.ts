/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'

/** Mirrors the column declarations emitted by Lucid's schema generator. */
export class UserSchema extends BaseModel {
  static $columns = ['deletedAt', 'email', 'id', 'username'] as const
  $columns = UserSchema.$columns

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column()
  declare email: string

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare username: string
}
