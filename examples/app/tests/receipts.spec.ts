/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { E_BULK_RECEIPT_REQUIRES_TRANSACTION, SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

class Parent extends compose(BaseModel, SoftDeletes) {
  static table = 'lifecycle_parents'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare label: string
  @column.dateTime() declare archivedAt: DateTime | null
}

async function seed(label: string) {
  return Parent.create({ tenantId: 1, label, archivedAt: null })
}

test.group('Installed receipts', (group) => {
  group.each.setup(async () => {
    await db.from('lifecycle_notes').delete()
    await db.from('lifecycle_children').delete()
    await db.from('lifecycle_parents').delete()
  })

  for (const operation of ['softDelete', 'restore', 'forceDelete'] as const) {
    test(`${operation} commits receipts and bookkeeping together`, async ({ assert }) => {
      const row = await seed(`${operation}-commit`)
      if (operation !== 'softDelete') await row.delete()

      const receipt = await db.transaction(async (trx) => {
        const query = Parent.query({ client: trx }).where('id', row.id)
        const result =
          operation === 'softDelete'
            ? await query.softDelete({ receipt: true })
            : operation === 'restore'
              ? await query.restore({ receipt: true })
              : await query.onlyTrashed().forceDelete({ receipt: true })
        for (const id of result.ids) {
          await trx
            .table('lifecycle_notes')
            .insert({ tenant_id: 1, parent_id: id, action: operation })
        }
        return result
      })

      const notes = await db.from('lifecycle_notes').where('parent_id', row.id)
      assert.equal(notes.length, receipt.count)
      assert.equal(receipt.count, 1)
      if (operation === 'forceDelete') {
        assert.isNull(await Parent.withTrashed().where('id', row.id).first())
      } else {
        const updated = await Parent.withTrashed().where('id', row.id).firstOrFail()
        assert.equal(updated.trashed, operation === 'softDelete')
      }
    })

    test(`${operation} rolls back receipts and bookkeeping together`, async ({ assert }) => {
      const row = await seed(`${operation}-rollback`)
      if (operation !== 'softDelete') await row.delete()
      const before = await db.from('lifecycle_parents').where('id', row.id)

      await assert.rejects(
        () =>
          db.transaction(async (trx) => {
            const query = Parent.query({ client: trx }).where('id', row.id)
            const result =
              operation === 'softDelete'
                ? await query.softDelete({ receipt: true })
                : operation === 'restore'
                  ? await query.restore({ receipt: true })
                  : await query.onlyTrashed().forceDelete({ receipt: true })
            for (const id of result.ids) {
              await trx
                .table('lifecycle_notes')
                .insert({ tenant_id: 1, parent_id: id, action: operation })
            }
            throw new Error('roll back receipt')
          }),
        'roll back receipt'
      )

      assert.deepEqual(await db.from('lifecycle_notes'), [])
      assert.deepEqual(await db.from('lifecycle_parents').where('id', row.id), before)
    })
  }

  test('rejects a receipt call outside a caller transaction', async ({ assert }) => {
    const row = await seed('outside-transaction')
    await assert.rejects(
      () => Parent.query().where('id', row.id).softDelete({ receipt: true }),
      E_BULK_RECEIPT_REQUIRES_TRANSACTION
    )
    const unchanged = await Parent.findOrFail(row.id)
    assert.isFalse(unchanged.trashed)
  })
})
