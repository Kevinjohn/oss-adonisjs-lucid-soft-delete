import { getActiveTest, test } from '@japa/runner'
import { acquireOwnedNamespace, createDatabase, createTables, dbClient } from './helpers.js'

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

  test('a secondary CREATE collision never claims an existing namespace', async ({ assert }) => {
    const namespaces = new Set(['existing'])
    const cleanups: Array<() => Promise<void>> = []

    await assert.rejects(
      () =>
        acquireOwnedNamespace(
          async () => {
            if (namespaces.has('existing')) throw new Error('namespace already exists')
          },
          async () => {},
          async () => {
            namespaces.delete('existing')
          },
          (cleanup) => cleanups.push(cleanup)
        ),
      /namespace already exists/
    )
    assert.deepEqual([...namespaces], ['existing'])
    assert.lengthOf(cleanups, 0)
  })

  test('a later setup or assertion failure disposes only the acquired namespace', async ({
    assert,
  }) => {
    const namespaces = new Set(['existing'])
    const cleanups: Array<() => Promise<void>> = []
    const events: string[] = []

    await assert.rejects(async () => {
      await acquireOwnedNamespace(
        async () => {
          namespaces.add('owned')
          events.push('create')
        },
        async () => {
          events.push('close')
        },
        async () => {
          events.push('drop')
          namespaces.delete('owned')
        },
        (cleanup) => cleanups.push(cleanup)
      )
      throw new Error('downstream assertion failed')
    }, /downstream assertion failed/)

    assert.lengthOf(cleanups, 1)
    await cleanups[0]()
    assert.deepEqual(events, ['create', 'close', 'drop'])
    assert.deepEqual([...namespaces], ['existing'])
  })

  test('a secondary close failure still attempts owned disposal and retains both errors', async ({
    assert,
  }) => {
    const closeFailure = new Error('close failed')
    const dropFailure = new Error('drop failed')
    const cleanups: Array<() => Promise<void>> = []
    let dropAttempted = false

    await acquireOwnedNamespace(
      async () => {},
      async () => {
        throw closeFailure
      },
      async () => {
        dropAttempted = true
        throw dropFailure
      },
      (cleanup) => cleanups.push(cleanup)
    )

    try {
      await cleanups[0]()
      assert.fail('Expected namespace cleanup to fail')
    } catch (error) {
      assert.isTrue(dropAttempted)
      assert.instanceOf(error, AggregateError)
      assert.deepEqual((error as AggregateError).errors, [closeFailure, dropFailure])
    }
  })

  test('a successful drop preserves the original close failure', async ({ assert }) => {
    const closeFailure = new Error('close failed')
    const cleanups: Array<() => Promise<void>> = []
    let dropped = false

    await acquireOwnedNamespace(
      async () => {},
      async () => {
        throw closeFailure
      },
      async () => {
        dropped = true
      },
      (cleanup) => cleanups.push(cleanup)
    )

    try {
      await cleanups[0]()
      assert.fail('Expected the close failure')
    } catch (error) {
      assert.isTrue(dropped)
      assert.strictEqual(error, closeFailure)
    }
  })
})
