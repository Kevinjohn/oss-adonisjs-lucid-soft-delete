import { test } from '@japa/runner'
import CreateUsersTable from '../../examples/app/database/migrations/0001_create_users_table.ts'
import CreateLifecycleParentsTable from '../../examples/app/database/migrations/0002_create_lifecycle_parents_table.ts'
import CreateLifecycleChildrenTable from '../../examples/app/database/migrations/0003_create_lifecycle_children_table.ts'
import CreateLifecycleNotesTable from '../../examples/app/database/migrations/0004_create_lifecycle_notes_table.ts'
import CreateRecoveryGroupsTable from '../../examples/app/database/migrations/0005_create_recovery_groups_table.ts'
import CreateRecoveryRecordsTable from '../../examples/app/database/migrations/0006_create_recovery_records_table.ts'
import { createDatabase } from '../helpers.ts'

test.group('example migrations', () => {
  test('creates the fixture tables, restricts referenced group deletion and rolls back', async ({
    assert,
    cleanup,
  }) => {
    const db = await createDatabase()
    const connection = db.connection()
    const tables = [
      'users',
      'lifecycle_parents',
      'lifecycle_children',
      'lifecycle_notes',
      'recovery_groups',
      'recovery_records',
    ]
    const migrations = [
      CreateUsersTable,
      CreateLifecycleParentsTable,
      CreateLifecycleChildrenTable,
      CreateLifecycleNotesTable,
      CreateRecoveryGroupsTable,
      CreateRecoveryRecordsTable,
    ]
    cleanup(async () => {
      for (const table of [...tables].reverse()) await connection.schema.dropTableIfExists(table)
    })

    for (const Migration of migrations) await new Migration(connection, Migration.name).execUp()
    for (const table of tables) assert.isTrue(await connection.schema.hasTable(table))

    const groupId = '00000000-0000-4000-8000-000000000001'
    await connection.table('recovery_groups').insert({
      id: groupId,
      tenant_id: 1,
      label: 'Fixture group',
      status: 'usable',
      created_at: new Date(),
    })
    await connection.table('recovery_records').insert({
      tenant_id: 1,
      record_id: 1,
      group_id: groupId,
      deleted_at: new Date(),
    })
    await assert.rejects(
      () => connection.from('recovery_groups').where('id', groupId).delete(),
      /foreign key/i
    )
    assert.isNotNull(await connection.from('recovery_groups').where('id', groupId).first())

    for (const Migration of [...migrations].reverse()) {
      await new Migration(connection, Migration.name).execDown()
    }
    for (const table of tables) assert.isFalse(await connection.schema.hasTable(table))
  })
})
