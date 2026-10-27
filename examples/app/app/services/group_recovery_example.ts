/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file distributed with this source code.
 */

// #region GROUP_RECOVERY_EXAMPLE
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import {
  RecoverableRecord,
  deleteGroup,
  invalidateGroup,
  purgeGroup,
  restoreGroup,
} from '#services/group_recovery'

export async function demonstrateGroupRecovery() {
  const tenantId = 41
  const archivedAt = DateTime.fromISO('2026-01-02T03:04:05.000Z')
  const first = await RecoverableRecord.create({ tenantId, label: 'Alder', archivedAt })
  const second = await RecoverableRecord.create({ tenantId, label: 'Birch', archivedAt })
  const active = await RecoverableRecord.create({ tenantId, label: 'Cedar', archivedAt })
  const older = await RecoverableRecord.create({
    tenantId,
    label: 'Elm',
    archivedAt,
    deletedAt: DateTime.fromISO('2026-01-03T00:00:00.000Z'),
  })
  const other = await RecoverableRecord.create({ tenantId: 42, label: 'Fir', archivedAt })
  const ids = [first.id, second.id]

  const originalGroup = await db.transaction((trx) =>
    deleteGroup(trx, {
      tenantId,
      ids: [...ids, older.id, other.id],
      label: 'First removal',
    })
  )
  const restored = await db.transaction((trx) =>
    restoreGroup(trx, { tenantId, groupId: originalGroup })
  )
  const restoredRows = await RecoverableRecord.query()
    .where('tenantId', tenantId)
    .whereIn('id', ids)
  const nextGroup = await db.transaction((trx) =>
    deleteGroup(trx, { tenantId, ids, label: 'Second removal' })
  )

  // A consumed group cannot restore or purge this later deletion. See the tests
  // for rejected calls and rollback after either operation's bookkeeping.
  const purged = await db.transaction(async (trx) => {
    // The application's authorization and cleanup-eligibility checks precede this.
    await invalidateGroup(trx, { tenantId, groupId: nextGroup })
    return purgeGroup(trx, { tenantId, groupId: nextGroup, ids: [first.id] })
  })
  const remaining = await RecoverableRecord.withTrashed()
    .whereIn('id', [...ids, active.id, older.id, other.id])
    .orderBy('id')
  const groups = await db.from('recovery_groups').whereIn('id', [originalGroup, nextGroup])
  const associations = await db.from('recovery_records').where('group_id', nextGroup)
  return {
    ids,
    originalGroup,
    nextGroup,
    restored,
    restoredRows,
    purged,
    remaining,
    groups,
    associations,
  }
}
// #endregion GROUP_RECOVERY_EXAMPLE
