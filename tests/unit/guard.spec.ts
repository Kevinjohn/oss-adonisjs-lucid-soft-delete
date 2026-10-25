/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import type { DateTime } from 'luxon'
import { SoftDeletes } from '../../src/mixin.js'
import { hasSoftDeletes } from '../../src/guard.js'

test.group('Soft-delete capability guard', () => {
  test('recognizes a model composed with SoftDeletes', ({ assert }) => {
    class User extends compose(BaseModel, SoftDeletes) {}
    User.boot()

    assert.isTrue(hasSoftDeletes(User))
  })

  test('does not recognize BaseModel', ({ assert }) => {
    assert.isFalse(hasSoftDeletes(BaseModel))
  })

  test('does not infer the capability from a deletedAt column', ({ assert }) => {
    class HandRolled extends BaseModel {
      @column.dateTime()
      declare deletedAt: DateTime | null
    }
    HandRolled.boot()

    assert.isTrue(HandRolled.$hasColumn('deletedAt'))
    assert.isFalse(hasSoftDeletes(HandRolled))
  })

  test('rejects non-model values safely', ({ assert }) => {
    assert.isFalse(hasSoftDeletes(null))
    assert.isFalse(hasSoftDeletes(undefined))
    assert.isFalse(hasSoftDeletes('model'))
    assert.isFalse(hasSoftDeletes({ deletedAt: true }))
  })
})
