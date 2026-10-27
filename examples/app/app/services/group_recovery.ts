/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file distributed with this source code.
 */

// #region GROUP_RECOVERY_SETUP
import { randomUUID } from 'node:crypto'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

export class RecoverableRecord extends compose(BaseModel, SoftDeletes) {
  static table = 'lifecycle_parents'
  @column({ isPrimary: true }) declare id: number
  @column() declare tenantId: number
  @column() declare label: string
  @column.dateTime() declare archivedAt: DateTime | null
  @column.dateTime() declare deletedAt: DateTime | null
}

function requireAffected(count: number | number[], message: string) {
  const affected = Array.isArray(count) ? count.length : count
  if (affected !== 1) throw new Error(message)
}
// #endregion GROUP_RECOVERY_SETUP

// #region GROUP_RECOVERY_OPERATIONS
/**
 * Create a one-use recovery group for rows this transaction actually soft-deletes.
 * All code that changes these rows must use this transaction protocol and serialize
 * writes per tenant and ID. Row locks help on databases that support them; SQLite
 * relies on its transaction write lock. Every caller must use the same rule.
 */
export async function deleteGroup(
  trx: TransactionClientContract,
  input: { tenantId: number; ids: number[]; label: string }
) {
  const ids = [...new Set(input.ids)]
  if (ids.length === 0) throw new Error('A recovery group requires at least one row ID')

  // Lock and read only active rows. The conditional package operation below remains
  // authoritative: a row enters this group only when softDelete reports one update.
  const candidates = await RecoverableRecord.query({ client: trx })
    .where('tenantId', input.tenantId)
    .whereIn('id', ids)
    .forUpdate()
  const groupId = randomUUID()
  const createdAt = new Date()
  await trx.table('recovery_groups').insert({
    id: groupId,
    tenant_id: input.tenantId,
    label: input.label,
    status: 'usable',
    created_at: createdAt,
  })

  let captured = 0
  for (const candidate of candidates) {
    const affected = await RecoverableRecord.query({ client: trx })
      .where('tenantId', input.tenantId)
      .where('id', candidate.id)
      .softDelete()
    if (affected !== 1) continue

    const deleted = await RecoverableRecord.query({ client: trx })
      .withTrashed()
      .where('tenantId', input.tenantId)
      .where('id', candidate.id)
      .firstOrFail()
    if (!deleted.trashed || !deleted.deletedAt)
      throw new Error('Deleted row timestamp was not recorded')

    // The row may have been restored outside this recipe after a group's mapping
    // became stale. Reassign its current ownership before recording this deletion.
    await trx
      .from('recovery_records')
      .where('tenant_id', input.tenantId)
      .where('record_id', candidate.id)
      .delete()

    await trx.table('recovery_records').insert({
      tenant_id: input.tenantId,
      record_id: candidate.id,
      group_id: groupId,
      deleted_at: deleted.deletedAt.toJSDate(),
    })
    captured += 1
  }

  if (captured === 0) throw new Error('No active rows were deleted for this recovery group')
  return groupId
}

/** Disable restoration while retaining current ownership records for cleanup. */
export async function invalidateGroup(
  trx: TransactionClientContract,
  input: { tenantId: number; groupId: string }
) {
  const affected = await trx
    .from('recovery_groups')
    .where('tenant_id', input.tenantId)
    .where('id', input.groupId)
    .where('status', 'usable')
    .update({ status: 'invalidated' })
  requireAffected(affected, 'Recovery group is missing or is no longer usable')
}

/** Restore a usable group once, preserving all non-deletion fields and original IDs. */
export async function restoreGroup(
  trx: TransactionClientContract,
  input: { tenantId: number; groupId: string }
) {
  const group = await trx
    .from('recovery_groups')
    .where('tenant_id', input.tenantId)
    .where('id', input.groupId)
    .forUpdate()
    .first()
  if (!group || group.status !== 'usable')
    throw new Error('Recovery group is missing or already consumed')

  const records = await trx
    .from('recovery_records')
    .where('tenant_id', input.tenantId)
    .where('group_id', input.groupId)
    .forUpdate()
  if (records.length === 0) throw new Error('Recovery group has no current row associations')

  const ids = records.map((record) => record.record_id)
  const rows = await RecoverableRecord.query({ client: trx })
    .withTrashed()
    .where('tenantId', input.tenantId)
    .whereIn('id', ids)
    .forUpdate()
  if (rows.length !== ids.length || rows.some((row) => !row.trashed)) {
    throw new Error('Recovery group no longer owns every selected trashed row')
  }

  requireAffected(
    await trx
      .from('recovery_groups')
      .where('tenant_id', input.tenantId)
      .where('id', input.groupId)
      .where('status', 'usable')
      .update({ status: 'consumed' }),
    'Recovery group is missing or already consumed'
  )
  const restored = await RecoverableRecord.query({ client: trx })
    .onlyTrashed()
    .where('tenantId', input.tenantId)
    .whereIn('id', ids)
    .restore()
  if (restored !== rows.length) throw new Error('Restore did not recover every current row')
  await trx
    .from('recovery_records')
    .where('tenant_id', input.tenantId)
    .where('group_id', input.groupId)
    .delete()
  return rows.length
}

/**
 * Permanently remove explicitly selected rows from an invalidated group. The current
 * association is checked before using onlyTrashed().forceDelete(), so an old group
 * cannot delete a row that a later deletion assigned to another group.
 */
export async function purgeGroup(
  trx: TransactionClientContract,
  input: { tenantId: number; groupId: string; ids: number[] }
) {
  const group = await trx
    .from('recovery_groups')
    .where('tenant_id', input.tenantId)
    .where('id', input.groupId)
    .forUpdate()
    .first()
  if (!group || group.status !== 'invalidated') {
    throw new Error('Recovery group is missing or is not invalidated')
  }

  const ids = [...new Set(input.ids)]
  if (ids.length === 0) throw new Error('Purge requires at least one selected row ID')
  const records = await trx
    .from('recovery_records')
    .where('tenant_id', input.tenantId)
    .where('group_id', input.groupId)
    .whereIn('record_id', ids)
    .forUpdate()
  if (records.length !== ids.length)
    throw new Error('Selected rows are not currently owned by this group')

  const rows = await RecoverableRecord.query({ client: trx })
    .onlyTrashed()
    .where('tenantId', input.tenantId)
    .whereIn('id', ids)
    .forUpdate()
  if (rows.length !== ids.length)
    throw new Error('Selected rows are not currently trashed for this tenant')

  const affected = await RecoverableRecord.query({ client: trx })
    .onlyTrashed()
    .where('tenantId', input.tenantId)
    .whereIn('id', ids)
    .forceDelete()
  if (affected !== ids.length) throw new Error('Purge did not remove every selected row')

  await trx
    .from('recovery_records')
    .where('tenant_id', input.tenantId)
    .where('group_id', input.groupId)
    .whereIn('record_id', ids)
    .delete()
  const remaining = await trx
    .from('recovery_records')
    .where('tenant_id', input.tenantId)
    .where('group_id', input.groupId)
    .count('* as total')
    .first()
  if (Number(remaining?.total ?? 0) === 0) {
    requireAffected(
      await trx
        .from('recovery_groups')
        .where('tenant_id', input.tenantId)
        .where('id', input.groupId)
        .where('status', 'invalidated')
        .update({ status: 'consumed' }),
      'Recovery group changed during purge'
    )
  }
  return affected
}
// #endregion GROUP_RECOVERY_OPERATIONS
