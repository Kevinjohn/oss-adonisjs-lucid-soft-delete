import { test } from '@japa/runner'
import {
  cleanupReceiptLock,
  openReceiptConnection,
  openReceiptTransaction,
  ReceiptLockConnections,
  waitForReceiptLock,
  type ReceiptConnection,
} from './fixtures/receipt_lock_wait.js'
import { createDatabase, dbClient } from './helpers.js'

function pending<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

for (const dialect of ['pg', 'mysql'] as const) {
  test(`${dialect}: pending connect remains owned and cannot return a late connection`, async ({
    assert,
  }) => {
    let complete!: (error?: Error) => void
    let closed = 0
    const stream = {
      destroy() {
        closed++
      },
    }
    const native: ReceiptConnection = {
      connect(callback) {
        complete = callback
      },
      on() {},
      connection: { stream },
      stream,
    }
    const driver = {
      Client: class {
        constructor() {
          return native
        }
      } as never,
      createConnection: () => native,
    }
    const owner = new ReceiptLockConnections(dialect, 10)
    const acquisition = owner.connect(driver, {})
    await assert.rejects(() => acquisition, owner.error.message)
    await owner.close()
    assert.equal(closed, 1)
    complete()
    await assert.rejects(() => acquisition, owner.error.message)
    assert.equal(closed, 1)
  })

  test(`${dialect}: deadline closes all owned transports during a pending operation`, async ({
    assert,
  }) => {
    const closed: number[] = []
    let number = 0
    const driver = {
      Client: class {
        constructor() {
          return create()
        }
      } as never,
      createConnection: () => create(),
    }
    function create(): ReceiptConnection {
      const id = number++
      const stream = {
        destroy() {
          closed.push(id)
        },
      }
      return {
        connect(done) {
          done()
        },
        on() {},
        connection: { stream },
        stream,
      }
    }
    const owner = new ReceiptLockConnections(dialect, 10)
    await owner.connect(driver, {})
    await owner.connect(driver, {})
    await owner.connect(driver, {})
    const operation = pending<void>()
    let error: unknown
    try {
      await owner.wait(operation.promise)
    } catch (caught) {
      error = caught
    }
    assert.strictEqual(error, owner.error)
    await assert.rejects(() => owner.close(error), owner.error.message)
    assert.deepEqual(closed, [2, 1, 0])
    operation.resolve()
  })

  test(`${dialect}: hard-close failures preserve the primary error and attempt every transport`, async ({
    assert,
  }) => {
    const primary = new Error('observer failed')
    const disposal = new Error('transport disposal failed')
    const closed: number[] = []
    let number = 0
    function create(): ReceiptConnection {
      const id = number++
      const stream = {
        destroy() {
          closed.push(id)
          if (id === 1) throw disposal
        },
      }
      return {
        connect(done) {
          done()
        },
        on() {},
        connection: { stream },
        stream,
      }
    }
    const owner = new ReceiptLockConnections(dialect)
    const driver = {
      Client: class {
        constructor() {
          return create()
        }
      } as never,
      createConnection: create,
    }
    await owner.connect(driver, {})
    await owner.connect(driver, {})
    let caught: unknown
    try {
      await owner.close(primary)
    } catch (error) {
      caught = error
    }
    assert.instanceOf(caught, AggregateError)
    assert.deepEqual((caught as AggregateError).errors, [primary, disposal])
    assert.strictEqual((caught as AggregateError).cause, primary)
    assert.deepEqual(closed, [1, 0])
  })
}

test('a cleanup timeout does not prevent the remaining cleanup attempts', async ({ assert }) => {
  const owner = new ReceiptLockConnections('pg', 10)
  const primary = new Error('primary query failed')
  const attempted: string[] = []
  let caught: unknown
  try {
    await cleanupReceiptLock(primary, [
      async () => {
        attempted.push('rollback')
        await owner.wait(pending<void>().promise)
      },
      async () => {
        attempted.push('competitor')
        await owner.wait(pending<void>().promise)
      },
    ])
  } catch (error) {
    caught = error
  }
  await owner.close()
  assert.deepEqual(attempted, ['rollback', 'competitor'])
  assert.deepEqual((caught as AggregateError).errors, [primary, owner.error, owner.error])
  assert.strictEqual((caught as AggregateError).cause, primary)
})

for (const dialect of ['pg', 'mysql'] as const) {
  test(`${dialect}: deadline disposes a real driver waiting for a connection handshake`, async ({
    assert,
  }) => {
    const { createServer } = await import('node:net')
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const accepted = pending<import('node:net').Socket>()
    const server = createServer((socket) => accepted.resolve(socket))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as import('node:net').AddressInfo
    const owner = new ReceiptLockConnections(dialect, 100)
    let socket: import('node:net').Socket | undefined
    try {
      const driver = require(dialect === 'pg' ? 'pg' : 'mysql2')
      const connection = owner.connect(driver, {
        host: '127.0.0.1',
        port: address.port,
        user: 'fixture',
        connectTimeout: 0,
      })
      socket = await owner.wait(accepted.promise)
      const closed = new Promise<void>((resolve) => socket!.once('close', resolve))
      // Neither server sends the protocol handshake; the driver connection stays pending.
      await assert.rejects(() => connection, owner.error.message)
      await owner.close()
      // Consume incoming startup bytes so the server observes the peer's close.
      socket.resume()
      await closed
      await assert.rejects(() => connection, owner.error.message)
    } finally {
      await owner.close()
      socket?.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }).timeout(3_000)
}

for (const phase of ['observer response', 'BEGIN', 'COMMIT', 'ROLLBACK'] as const) {
  test(`deadline closes the actual driver during a stalled ${phase}`, async ({ assert }) => {
    if (dbClient === 'sqlite') throw new Error('server driver required')
    const db = await createDatabase()
    const owner = new ReceiptLockConnections(dbClient, 1_000)
    let caught: unknown
    try {
      const native = await openReceiptConnection(db, owner)
      const transaction =
        phase === 'COMMIT' || phase === 'ROLLBACK'
          ? await owner.wait(openReceiptTransaction(db, native))
          : undefined
      const stream = (
        dbClient === 'pg' ? native.connection!.stream : native.stream!
      ) as import('node:net').Socket
      stream.pause()
      const operation =
        phase === 'BEGIN'
          ? openReceiptTransaction(db, native)
          : phase === 'COMMIT'
            ? transaction!.commit()
            : phase === 'ROLLBACK'
              ? transaction!.rollback()
              : waitForReceiptLock(db, dbClient, owner, native, 'stalled_observer', 1, () => false)
      try {
        await owner.wait<unknown>(operation)
      } catch (error) {
        caught = error
      }
      assert.strictEqual(caught, owner.error)
      await owner.close()
      assert.isTrue(stream.destroyed)
    } finally {
      await owner.close()
    }
  })
    .skip(dbClient === 'sqlite', 'requires server driver')
    .timeout(3_000)
}
