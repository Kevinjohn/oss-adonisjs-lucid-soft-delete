/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { DateTime } from 'luxon'
import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import {
  E_BULK_RECEIPT_DIVERGED,
  E_BULK_RECEIPT_REQUIRES_TRANSACTION,
  E_BULK_RECEIPT_UNSUPPORTED,
} from './errors.js'
import { resolveTableReference, aliasFromTable } from './table_reference.js'

/** Raw driver value of the model's primary key. A bigint from the driver is converted with String(). */
export type PrimaryKeyValue = number | string

export interface BulkReceiptOptions {
  receipt?: boolean
}

export interface BulkReceipt {
  /** Rows the write changed. Equals ids.length. */
  count: number
  /** Primary-key values of the changed rows. Set semantics: no defined order, no duplicates. */
  ids: PrimaryKeyValue[]
}

export type RestoreReceipt = BulkReceipt
export type ForceDeleteReceipt = BulkReceipt

export interface SoftDeleteReceipt extends BulkReceipt {
  /**
   * The instant the written literal denotes in the Node process zone, truncated to the
   * dialect's date-time format precision (milliseconds on PostgreSQL, seconds elsewhere).
   * null when count is 0.
   */
  deletedAt: DateTime | null
}

type Query = ModelQueryBuilderContract<LucidModel>
type KnexLike = {
  _method?: string
  _statements: { grouping: string }[]
  _single: { table?: unknown; limit?: unknown; offset?: unknown }
  client?: { transacting?: boolean }
}

const SUPPORTED_DIALECTS = new Set(['postgres', 'mysql', 'sqlite3', 'better-sqlite3'])
const REJECTED_GROUPINGS = new Set(['join', 'group', 'having', 'order', 'union'])

/** Returns true for receipt mode. Throws TypeError for anything other than undefined or { receipt?: boolean }. */
export function parseReceiptOptions(options: unknown): boolean {
  if (options === undefined) return false
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Bulk lifecycle options must be an object')
  }
  for (const key of Object.keys(options)) {
    if (key !== 'receipt') throw new TypeError(`Unknown bulk lifecycle option "${key}"`)
  }
  const receipt = (options as { receipt?: unknown }).receipt
  if (receipt !== undefined && typeof receipt !== 'boolean') {
    throw new TypeError('Bulk lifecycle option "receipt" must be a boolean')
  }
  return receipt === true
}

/** Dialect, transaction, relation-type and query-shape checks. Runs on `this` before any clone or statement. */
export function ensureReceiptSupport(query: Query): void {
  const dialect = query.client.dialect.name
  if (!SUPPORTED_DIALECTS.has(dialect))
    throw new E_BULK_RECEIPT_UNSUPPORTED(`the ${dialect} dialect`)
  const knexQuery = query.knexQuery as unknown as KnexLike
  if (knexQuery.client?.transacting !== true) throw new E_BULK_RECEIPT_REQUIRES_TRANSACTION()
  const type = (query as unknown as { relation?: { type?: string } }).relation?.type
  if (type === 'hasOne' || type === 'belongsTo') {
    throw new E_BULK_RECEIPT_UNSUPPORTED(
      `${type} relation builders; query the related model by its IDs instead`
    )
  }
  // Lucid applies these later and does not retain them on relation-builder clones.
  const groupConstraints = (
    query as unknown as { groupConstraints?: { limit?: unknown; orderBy?: unknown } }
  ).groupConstraints
  if (groupConstraints?.limit !== undefined || groupConstraints?.orderBy !== undefined) {
    throw new E_BULK_RECEIPT_UNSUPPORTED('groupLimit or groupOrderBy clauses')
  }
  const flags = query as unknown as {
    hasAggregates?: boolean
    hasGroupBy?: boolean
    hasUnion?: boolean
  }
  if (flags.hasAggregates || flags.hasGroupBy || flags.hasUnion) {
    throw new E_BULK_RECEIPT_UNSUPPORTED('aggregate, group by or union queries')
  }
  if (knexQuery._statements.some((statement) => REJECTED_GROUPINGS.has(statement.grouping))) {
    throw new E_BULK_RECEIPT_UNSUPPORTED('joins, group by, having, order by or union clauses')
  }
  if (knexQuery._single.limit !== undefined || knexQuery._single.offset !== undefined) {
    throw new E_BULK_RECEIPT_UNSUPPORTED('limit or offset clauses')
  }
  const table = knexQuery._single.table
  if (typeof table !== 'string' && !aliasFromTable(table)) {
    throw new E_BULK_RECEIPT_UNSUPPORTED('raw or sub-query from clauses')
  }
}

/** Current local time truncated to what the dialect format can store. Count mode writes the same literal. */
export function deletionTimestamp(query: Query): DateTime {
  const now = DateTime.local()
  return /S/.test(query.client.dialect.dateTimeFormat) ? now : now.startOf('second')
}

/** The existing count normalisation, shared by both modes. */
export function normaliseWriteCount(result: unknown[]): number {
  return typeof result[0] === 'number' ? result[0] : result.length
}

function normaliseId(value: unknown): PrimaryKeyValue {
  return typeof value === 'bigint' ? value.toString() : (value as PrimaryKeyValue)
}

/**
 * Run `write` so the changed rows' primary keys are known. `query` already carries the scope
 * filter (or grouped caller predicates). Statements run on clones; `query` itself never executes.
 */
export async function executeWithReceipt(
  query: Query,
  write: (target: Query) => Promise<unknown[]>
): Promise<BulkReceipt> {
  const pkAttribute = query.model.primaryKey
  const pkColumn = query.model.$getColumn(pkAttribute)!.columnName
  const dialect = query.client.dialect.name

  if (dialect === 'postgres') {
    const target = query.clone()
    target.returning(pkAttribute) // Lucid resolves the attribute to its column; row keys use the column name
    const rows = (await write(target)) as Record<string, unknown>[]
    return { count: rows.length, ids: rows.map((row) => normaliseId(row[pkColumn])) }
  }

  const reference = `${resolveTableReference(query)}.${pkColumn}`
  const selector = query.clone()
  ;(selector.knexQuery as unknown as KnexLike)._method = 'select' // a builder reused after count mode is still an update/del
  selector.pojo().clearSelect().select(reference).orderBy(reference, 'asc')
  if (dialect === 'mysql') selector.forUpdate()
  const rows = (await selector.exec()) as unknown as Record<string, unknown>[]
  const ids = rows.map((row) => normaliseId(row[pkColumn]))
  if (ids.length === 0) return { count: 0, ids }

  const target = query.clone()
  target.whereIn(reference, ids)
  const count = normaliseWriteCount(await write(target))
  if (count !== ids.length) throw new E_BULK_RECEIPT_DIVERGED(ids.length, count)
  return { count, ids }
}
