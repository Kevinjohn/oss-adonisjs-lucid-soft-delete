import { getActiveTest, test } from '@japa/runner'
import { createDatabase, createTables, dbClient } from './helpers.js'

test.group('fixture ownership', () => {
  test('a users collision leaves existing tables intact', async ({ assert }) => {
    if (dbClient !== 'sqlite') return
    const db = await createDatabase()
    await db.connection().schema.createTable('users', (table) => table.increments())
    await db.connection().schema.createTable('roles', (table) => table.increments())

    getActiveTest()?.cleanup(async () => {
      assert.isTrue(await db.connection().schema.hasTable('users'))
      assert.isTrue(await db.connection().schema.hasTable('roles'))
    })
    await assert.rejects(() => createTables(db), /users.*already exists/)
  })

  test('a later collision disposes only earlier acquired tables', async ({ assert }) => {
    if (dbClient !== 'sqlite') return
    const db = await createDatabase()
    await db.connection().schema.createTable('industries', (table) => table.increments())

    getActiveTest()?.cleanup(async () => {
      assert.isFalse(await db.connection().schema.hasTable('users'))
      assert.isTrue(await db.connection().schema.hasTable('industries'))
    })
    await assert.rejects(() => createTables(db), /industries.*already exists/)
  })
})
