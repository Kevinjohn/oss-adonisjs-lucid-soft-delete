import type { createDatabase } from '../helpers.js'

type Database = Awaited<ReturnType<typeof createDatabase>>
type Client = 'pg' | 'mysql'

const OBSERVATION_TIMEOUT_MS = 5_000
const QUERY_TIMEOUT_MS = 1_000
const POLL_INTERVAL_MS = 25

type KnexConnection = Awaited<ReturnType<Database['connection']>['knexClient']['acquireConnection']>

async function acquireObserverConnection(db: Database) {
  const client = db.connection().knexClient
  const pool = client.pool as unknown as {
    acquireTimeoutMillis: number
    acquire(): { promise: Promise<KnexConnection> }
  }
  const acquireTimeoutMs = pool.acquireTimeoutMillis
  pool.acquireTimeoutMillis = QUERY_TIMEOUT_MS
  let acquisition: ReturnType<typeof pool.acquire>
  try {
    acquisition = pool.acquire()
  } finally {
    pool.acquireTimeoutMillis = acquireTimeoutMs
  }
  return acquisition.promise as Promise<KnexConnection>
}

async function observeLockWait(
  db: Database,
  client: Client,
  connection: KnexConnection,
  query: string,
  bindings: unknown[]
) {
  const connectionDb = db.connection()
  if (client === 'pg') {
    await connectionDb.knexRawQuery('BEGIN').knexQuery.connection(connection)
    let result: unknown
    let primaryError: unknown
    try {
      await connectionDb
        .knexRawQuery(`SET LOCAL statement_timeout = '${QUERY_TIMEOUT_MS}ms'`)
        .knexQuery.connection(connection)
      result = await connectionDb.knexRawQuery(query, bindings).knexQuery.connection(connection)
    } catch (error) {
      primaryError = error
    }
    await cleanupReceiptLock(primaryError, [
      () => connectionDb.knexRawQuery('ROLLBACK').knexQuery.connection(connection),
    ])
    return result
  }

  return connectionDb
    .knexRawQuery(
      query.replace(/^\s*SELECT/i, `SELECT /*+ MAX_EXECUTION_TIME(${QUERY_TIMEOUT_MS}) */`),
      bindings
    )
    .knexQuery.connection(connection)
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

    const connection = await acquireObserverConnection(db)
    let result: unknown
    try {
      result = await observeLockWait(db, client, connection, query, [`%${marker}%`, blockerId])
    } finally {
      await db.connection().knexClient.releaseConnection(connection)
    }
    const rows =
      client === 'pg' ? (result as { rows: unknown[] }).rows : (result as [unknown[], unknown])[0]
    if (rows.length > 0) return

    if (hasSettled()) {
      throw new Error('The competing receipt write settled before its lock wait was observed')
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(
    `Timed out after ${OBSERVATION_TIMEOUT_MS}ms waiting for the marked receipt write to block on session ${blockerId}`
  )
}
