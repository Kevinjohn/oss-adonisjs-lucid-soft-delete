/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { FactoryManager } from '@adonisjs/lucid/factories'
import { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import { createDatabase, createTables } from '../helpers.js'
import { RelationUser } from '../fixtures/models.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'

test.group('Soft-delete factories, seeders, and transactions', (group) => {
  group.setup(() => {
    extendModelQueryBuilder(ModelQueryBuilder)
  })

  test('factory trashed state persists a soft-deleted model', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)

    const factory = new FactoryManager()
      .define(RelationUser, () => ({
        username: 'factory-trashed',
        email: 'factory-trashed@example.test',
        managerId: null,
      }))
      .state('trashed', (user) => {
        user.deletedAt = DateTime.local()
      })
      .build()

    const user = await factory.apply('trashed').create()
    const persisted = await RelationUser.withTrashed().where('id', user.id).firstOrFail()

    assert.isTrue(persisted.trashed)
  })

  test('updateOrCreate against a soft-deleted unique value fails database uniqueness', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    const user = new RelationUser()
    user.fill({
      username: 'seeded-user',
      email: 'seeded-user@example.test',
      managerId: null,
    })
    await user.save()
    await user.delete()

    const error = await RelationUser.updateOrCreate(
      { username: 'seeded-user' },
      { email: 'seeded-user@example.test', managerId: null }
    ).then(
      () => undefined,
      (cause: unknown) => cause
    )
    assert.isDefined(error, 'updateOrCreate should violate the unique constraint')
    assert.oneOf((error as { code?: string }).code, ['23505', 'SQLITE_CONSTRAINT_UNIQUE'])

    const persisted = await RelationUser.withTrashed().where('id', user.id).firstOrFail()
    assert.isTrue(persisted.trashed)
  })

  test('soft delete executes on a transaction client and rolls back in isolation', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    const user = new RelationUser()
    user.fill({
      username: 'transaction-soft-delete',
      email: 'transaction-soft-delete@example.test',
      managerId: null,
    })
    await user.save()

    const transaction = await db.transaction()
    try {
      const transactionUser = (await RelationUser.query({ client: transaction })
        .where('id', user.id)
        .firstOrFail()) as RelationUser
      await transactionUser.delete()

      assert.isTrue(transactionUser.trashed)

      const deletedInTransaction = await RelationUser.query({ client: transaction })
        .withTrashed()
        .where('id', user.id)
        .firstOrFail()
      assert.isTrue(deletedInTransaction.trashed)
    } finally {
      await transaction.rollback()
    }

    const persisted = await RelationUser.withTrashed().where('id', user.id).firstOrFail()
    assert.isFalse(persisted.trashed)
  })
})
