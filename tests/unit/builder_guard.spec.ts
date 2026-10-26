/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { BaseModel, column, ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import type { DateTime } from 'luxon'
import { E_MODEL_SOFT_DELETE } from '../../src/errors.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'
import { createDatabase, createTables } from '../helpers.js'

/** A deletedAt column without SoftDeletes, so only the capability guard can reject restore(). */
class PlainModel extends BaseModel {
  static table = 'users'

  @column({ isPrimary: true })
  declare id: number

  @column.dateTime()
  declare deletedAt: DateTime | null
}

type SoftDeleteMacros = {
  withTrashed(): unknown
  onlyTrashed(): unknown
  restore(): Promise<number>
}

test.group('Builder macro runtime guard', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('{$self} rejects a model without SoftDeletes')
    .with(['withTrashed', 'onlyTrashed', 'restore'] as const)
    .run(async ({ assert }, macro) => {
      const db = await createDatabase()
      await createTables(db)
      const query = PlainModel.query() as unknown as SoftDeleteMacros

      let error: unknown
      try {
        await query[macro]()
      } catch (thrown) {
        error = thrown
      }

      assert.instanceOf(error, E_MODEL_SOFT_DELETE)
      const exception = error as E_MODEL_SOFT_DELETE
      assert.equal(exception.code, 'E_MODEL_SOFT_DELETE')
      assert.equal(exception.status, 500)
      assert.equal(exception.message, 'PlainModel does not use SoftDeletes')
    })
})
