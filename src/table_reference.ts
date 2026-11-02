/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { RawBuilderContract } from '@adonisjs/lucid/types/querybuilder'

type KnexBuilderLike = {
  client: { wrapIdentifier(value: string, queryContext?: unknown): string }
  queryContext(): unknown
}

export function aliasFromTable(table: unknown): string | undefined {
  if (typeof table === 'string') {
    const separatorIndex = table.search(/ as /i)
    if (separatorIndex === -1) return undefined
    return table.slice(separatorIndex + 4).trim() || undefined
  }
  if (table && typeof table === 'object' && !Array.isArray(table)) {
    const entries = Object.entries(table)
    if (entries.length === 1 && typeof entries[0][1] === 'string') return entries[0][0]
  }
  return undefined
}

export function resolveTableReference(query: ModelQueryBuilderContract<LucidModel>): string {
  const tableAlias = (query as { tableAlias?: string }).tableAlias
  if (tableAlias) return tableAlias

  const table = (query.knexQuery as unknown as { _single?: { table?: unknown } })._single?.table
  const alias = aliasFromTable(table)
  if (alias) return alias

  return query.model.table
}

/**
 * Qualify a column while keeping a literal dot inside an alias as part of that identifier.
 * Knex splits dots in ordinary column strings into identifier segments, but its table alias
 * syntax quotes the alias as one identifier. Build a raw reference with the active dialect's
 * identifier wrapper so the two sides of that SQL reference stay consistent.
 */
export function qualifiedColumnReference(
  query: ModelQueryBuilderContract<LucidModel>,
  column: string,
  tableReference = resolveTableReference(query),
  literalAlias = false,
  queryContext?: unknown
): string | RawBuilderContract {
  const knexQuery = query.knexQuery as unknown as KnexBuilderLike
  const queryTable = (query.knexQuery as unknown as { _single?: { table?: unknown } })._single
    ?.table
  const isAlias =
    literalAlias ||
    (query as { tableAlias?: string }).tableAlias === tableReference ||
    aliasFromTable(queryTable) === tableReference
  if (!tableReference.includes('.') || !isAlias) return `${tableReference}.${column}`

  const knexClient = knexQuery.client
  const context = queryContext ?? knexQuery.queryContext()
  return query.client.raw(
    `${knexClient.wrapIdentifier(tableReference, context)}.${knexClient.wrapIdentifier(column, context)}`
  )
}
