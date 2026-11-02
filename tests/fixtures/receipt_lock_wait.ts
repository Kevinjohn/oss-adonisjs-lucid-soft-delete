import type { createDatabase } from '../helpers.js'

type Database = Awaited<ReturnType<typeof createDatabase>>
type Client = 'pg' | 'mysql'

const OBSERVATION_TIMEOUT_MS = 5_000
const QUERY_TIMEOUT_MS = 1_000
const POLL_INTERVAL_MS = 25

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

    const result = await db
      .connection()
      .knexRawQuery(query, [`%${marker}%`, blockerId])
      .timeout(QUERY_TIMEOUT_MS, { cancel: true })
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
