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
import { BaseModel, beforeFetch, beforeFind, column, hasMany } from '@adonisjs/lucid/orm'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

class Parent extends compose(BaseModel, SoftDeletes) {
  static table = 'lifecycle_parents'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare label: string
  @column.dateTime() declare archivedAt: DateTime | null
  @hasMany(() => Child, { foreignKey: 'parentId' }) declare children: HasMany<typeof Child>
}
class Child extends compose(BaseModel, SoftDeletes) {
  static table = 'lifecycle_children'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare parentId: number
  @column() declare label: string
}
class HookedParent extends Parent {
  static table = 'lifecycle_parents'
  @beforeFind()
  @beforeFetch()
  static appendAlternative(query: ModelQueryBuilderContract<typeof HookedParent>) {
    query.orWhere('label', 'hook-deleted')
  }
}
const archivedAt = DateTime.fromISO('2026-01-02T03:04:05.000Z')
async function seed() {
  const selected = await Parent.create({ tenantId: 1, label: 'selected', archivedAt })
  const other = await Parent.create({ tenantId: 2, label: 'other', archivedAt })
  const child = await Child.create({ tenantId: 1, parentId: selected.id, label: 'active child' })
  const deletedChild = await Child.create({
    tenantId: 1,
    parentId: selected.id,
    label: 'deleted child',
  })
  await deletedChild.delete()
  const otherChild = await Child.create({ tenantId: 2, parentId: other.id, label: 'other child' })
  return { selected, other, child, deletedChild, otherChild }
}
const actions = [
  'instanceDelete',
  'instanceRestore',
  'instanceForceDelete',
  'builderSoftDelete',
  'builderRestore',
  'builderForceDelete',
] as const

test.group('Installed transactional lifecycle', (group) => {
  group.each.setup(async () => {
    await db.from('lifecycle_notes').delete()
    await db.from('lifecycle_children').delete()
    await db.from('lifecycle_parents').delete()
  })
  for (const action of actions) {
    for (const outcome of ['commit', 'rollback', 'policyReject'] as const) {
      test(`${action} with caller bookkeeping: ${outcome}`, async ({ assert }) => {
        const { selected, other, child, otherChild } = await seed()
        const restoring = action === 'instanceRestore' || action === 'builderRestore'
        if (restoring) await selected.delete()
        const before = await db.from('lifecycle_parents').orderBy('id')
        async function execute() {
          await db.transaction(async (trx) => {
            if (outcome === 'policyReject') throw new Error('policy rejected')
            const query = Parent.query({ client: trx })
              .where('tenantId', 1)
              .where('id', selected.id)
            if (action.startsWith('instance')) {
              const record = await query.withTrashed().firstOrFail()
              if (action === 'instanceDelete') await record.delete()
              if (action === 'instanceRestore') await record.restore()
              if (action === 'instanceForceDelete') await record.forceDelete()
            } else {
              let affected: number
              if (action === 'builderSoftDelete') affected = await query.softDelete()
              else if (action === 'builderRestore') affected = await query.restore()
              else affected = await query.forceDelete()
              assert.equal(affected, 1)
            }
            await trx
              .table('lifecycle_notes')
              .insert({ tenant_id: 1, parent_id: selected.id, action })
            if (outcome === 'rollback') throw new Error('bookkeeping rejected')
          })
        }
        if (outcome === 'commit') await execute()
        else
          await assert.rejects(
            execute,
            outcome === 'rollback' ? 'bookkeeping rejected' : 'policy rejected'
          )
        const after = await db.from('lifecycle_parents').orderBy('id')
        const notes = await db.from('lifecycle_notes')
        if (outcome !== 'commit') {
          assert.deepEqual(after, before)
          assert.deepEqual(notes, [])
        } else {
          assert.lengthOf(notes, 1)
          assert.equal(notes[0].tenant_id, 1)
          assert.equal(notes[0].parent_id, selected.id)
          assert.equal(notes[0].action, action)
          const remaining = await Parent.withTrashed()
            .where('tenantId', 1)
            .where('id', selected.id)
            .first()
          if (action.endsWith('ForceDelete')) assert.isNull(remaining)
          else {
            assert.isNotNull(remaining)
            assert.equal(remaining!.trashed, !restoring)
            assert.equal(remaining!.archivedAt!.toMillis(), archivedAt.toMillis())
          }
        }
        const untouched = await Parent.query()
          .where('tenantId', 2)
          .where('id', other.id)
          .firstOrFail()
        assert.isFalse(untouched.trashed)
        assert.equal(untouched.archivedAt!.toMillis(), archivedAt.toMillis())
        assert.isNotNull(await Child.query().where('tenantId', 1).where('id', child.id).first())
        assert.isNotNull(
          await Child.query().where('tenantId', 2).where('id', otherChild.id).first()
        )
      })
    }
  }
  test('subclass hooks, complete-state relations and aggregate modes use the public scope', async ({
    assert,
  }) => {
    const { selected, other, child, deletedChild } = await seed()
    const hooked = await Parent.create({ tenantId: 1, label: 'hook-deleted', archivedAt: null })
    await hooked.delete()
    assert.isNull(await HookedParent.query().where('tenantId', 1).where('label', 'missing').first())
    assert.deepEqual(
      await HookedParent.query().where('tenantId', 1).where('label', 'missing').exec(),
      []
    )
    const counted = await Parent.query()
      .where('tenantId', 1)
      .where('id', selected.id)
      .withCount('children')
      .withCount('children', (query) => query.withTrashed().as('all_children'))
      .firstOrFail()
    assert.equal(Number(counted.$extras.children_count), 1)
    assert.equal(Number(counted.$extras.all_children), 2)
    assert.isNull(
      await Parent.query()
        .where('tenantId', 1)
        .whereHas('children', (query) => query.where('id', deletedChild.id))
        .first()
    )
    const matched = await Parent.query()
      .where('tenantId', 1)
      .whereHas('children', (query) => query.withTrashed().where('id', deletedChild.id))
      .firstOrFail()
    assert.equal(matched.id, selected.id)
    await selected.delete()
    assert.isNull(
      await Parent.query().where('tenantId', 1).where('id', selected.id).preload('children').first()
    )
    const complete = await Parent.withTrashed()
      .where('tenantId', 1)
      .where('id', selected.id)
      .preload('children')
      .firstOrFail()
    assert.isTrue(complete.trashed)
    assert.deepEqual(
      complete.children.map((row) => row.id),
      [child.id]
    )
    const allLevels = await Parent.withTrashed()
      .where('tenantId', 1)
      .where('id', selected.id)
      .preload('children', (query) => query.withTrashed())
      .firstOrFail()
    assert.sameMembers(
      allLevels.children.map((row) => row.id),
      [child.id, deletedChild.id]
    )
    const otherTenant = await Parent.query().where('tenantId', 2).firstOrFail()
    assert.equal(otherTenant.id, other.id)
  })
})
