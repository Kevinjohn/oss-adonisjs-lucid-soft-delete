import type { createDatabase } from '../helpers.js'

type Database = Awaited<ReturnType<typeof createDatabase>>
type Client = 'pg' | 'mysql'

const OBSERVATION_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 25

type Transport = { destroy(): unknown }
export type ReceiptConnection = {
  connect(callback: (error?: Error) => void): unknown
  on(event: string, callback: (...args: never[]) => void): unknown
  stream?: Transport
  connection?: { stream: Transport }
}

type Driver = {
  Client: new (settings: unknown) => ReceiptConnection
  createConnection(settings: unknown): ReceiptConnection
}

/** Owns native transports before connecting; no pending pool lease can escape the deadline. */
export class ReceiptLockConnections {
  readonly error = new Error('Receipt lock journey exceeded its deadline')
  private connections = new Set<ReceiptConnection>()
  private expired = false
  private deadline: Promise<never>
  private timer!: ReturnType<typeof setTimeout>

  constructor(
    private client: Client,
    timeoutMs = 10_000
  ) {
    this.deadline = new Promise((_, reject) => {
      this.timer = setTimeout(() => {
        this.expired = true
        reject(this.error)
      }, timeoutMs)
    })
    // The deadline may expire between operations.
    void this.deadline.catch(() => {})
  }

  async wait<T>(operation: PromiseLike<T>): Promise<T> {
    return Promise.race([operation, this.deadline])
  }

  async connect(driver: Driver, settings: unknown) {
    if (this.expired) throw this.error
    const connection =
      this.client === 'pg' ? new driver.Client(settings) : driver.createConnection(settings)
    this.connections.add(connection)
    connection.on('error', () => {})
    await this.wait(
      new Promise<void>((resolve, reject) => {
        connection.connect((error) => (error ? reject(error) : resolve()))
      })
    )
    if (this.expired) throw this.error
    return connection
  }

  async close(primaryError?: unknown) {
    clearTimeout(this.timer)
    this.expired = true
    const connections = [...this.connections].reverse()
    this.connections.clear()
    // Closing the stream aborts queued queries and connect attempts as well as active writes.
    await cleanupReceiptLock(
      primaryError,
      connections.map((connection) => async () => {
        const stream = this.client === 'pg' ? connection.connection!.stream : connection.stream!
        stream.destroy()
      })
    )
  }
}

/** Lucid forwards the external connection option to Knex but omits it from its types. */
export async function openReceiptTransaction(db: Database, connection: ReceiptConnection) {
  const client = db.connection()
  const transaction = client.transaction as unknown as (
    callback: undefined,
    options: { connection: ReceiptConnection }
  ) => ReturnType<Database['transaction']>
  return transaction.call(client, undefined, { connection })
}

export async function openReceiptConnection(db: Database, connections: ReceiptLockConnections) {
  const client = db.connection().getWriteClient().client as unknown as {
    driver: Driver
    connectionSettings: unknown
  }
  return connections.connect(client.driver, client.connectionSettings)
}

/** Runs cleanup actions independently and keeps the original failure in an aggregate. */
export async function cleanupReceiptLock(
  primaryError: unknown,
  cleanups: Array<() => Promise<unknown>>
) {
  const errors: unknown[] = primaryError === undefined ? [] : [primaryError]
  for (const cleanup of cleanups) {
    try {
      await cleanup()
    } catch (error) {
      errors.push(error)
    }
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, 'Receipt lock test failed during cleanup', {
      cause: primaryError,
    })
  }
  if (errors.length === 1) throw errors[0]
}

/** Waits until the marked write is observed waiting on the supplied transaction. */
export async function waitForReceiptLock(
  db: Database,
  client: Client,
  connections: ReceiptLockConnections,
  connection: ReceiptConnection,
  marker: string,
  blockerId: number,
  hasSettled: () => boolean
) {
  const deadline = Date.now() + OBSERVATION_TIMEOUT_MS
  const query =
    client === 'pg'
      ? `
        SELECT a.pid
        FROM pg_stat_activity AS a
        WHERE a.datname = current_database()
          AND a.pid <> pg_backend_pid()
          AND a.state = 'active'
          AND a.wait_event_type = 'Lock'
          AND a.query LIKE ?
          AND ?::integer = ANY(pg_blocking_pids(a.pid))
      `
      : `
        SELECT requesting.PROCESSLIST_ID AS blocked_id
        FROM performance_schema.data_lock_waits AS waits
        JOIN performance_schema.threads AS requesting
          ON requesting.THREAD_ID = waits.REQUESTING_THREAD_ID
        JOIN performance_schema.threads AS blocking
          ON blocking.THREAD_ID = waits.BLOCKING_THREAD_ID
        WHERE waits.ENGINE = 'INNODB'
          AND requesting.PROCESSLIST_DB = DATABASE()
          AND requesting.PROCESSLIST_INFO LIKE ?
          AND blocking.PROCESSLIST_ID = ?
      `

  while (Date.now() < deadline) {
    if (hasSettled()) {
      throw new Error('The competing receipt write settled before its lock wait was observed')
    }
    const result = await connections.wait(
      db
        .connection()
        .knexRawQuery(query, [`%${marker}%`, blockerId])
        .connection(connection)
    )
    const rows =
      client === 'pg' ? (result as { rows: unknown[] }).rows : (result as [unknown[], unknown])[0]
    if (rows.length > 0) return
    await connections.wait(new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS)))
  }

  throw new Error(
    `Timed out after ${OBSERVATION_TIMEOUT_MS}ms waiting for the marked receipt write to block on session ${blockerId}`
  )
}
