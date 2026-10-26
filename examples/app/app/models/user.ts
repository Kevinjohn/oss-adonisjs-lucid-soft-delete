/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'
import { UserSchema } from '#database/schema'

export default class User extends compose(UserSchema, SoftDeletes) {}
