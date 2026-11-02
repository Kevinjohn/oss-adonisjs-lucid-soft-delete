/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

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
