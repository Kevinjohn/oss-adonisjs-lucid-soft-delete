/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import { E_MODEL_SOFT_DELETE } from './errors.js'

export const SOFT_DELETES_MODE = 'softDeletesMode' as const
export type SoftDeletesMode = 'default' | 'with' | 'only'

type ScopedQuery = {
  [SOFT_DELETES_MODE]?: SoftDeletesMode
}

type FilterableQuery = {
  whereNull(column: string): unknown
  whereNotNull(column: string): unknown
}

const PATCHED = Symbol.for('@kevinjohn/lucid-soft-deletes/patched')

function aliasFromTable(table: unknown): string | undefined {
  if (typeof table === 'string') return table.match(/\s+as\s+(\w+)$/i)?.[1]
  if (table && typeof table === 'object' && !Array.isArray(table)) {
    const entries = Object.entries(table)
    if (entries.length === 1 && typeof entries[0][1] === 'string') return entries[0][0]
  }
  return undefined
}

export function setSoftDeletesMode<Query extends object>(
  query: Query,
  mode: SoftDeletesMode
): Query {
  ;(query as ScopedQuery)[SOFT_DELETES_MODE] = mode
  const knexQuery = (query as { knexQuery?: object }).knexQuery
  if (knexQuery) (knexQuery as ScopedQuery)[SOFT_DELETES_MODE] = mode
  return query
}

export function getSoftDeletesMode(query: object): SoftDeletesMode {
  return (query as ScopedQuery)[SOFT_DELETES_MODE] ?? 'default'
}

export function resolveTableReference(query: ModelQueryBuilderContract<LucidModel>): string {
  const tableAlias = (query as { tableAlias?: string }).tableAlias
  if (tableAlias) return tableAlias

  const table = (query.knexQuery as unknown as { _single?: { table?: unknown } })._single?.table
  const alias = aliasFromTable(table)
  if (alias) return alias

  return query.model.table
}

export function applyScope(query: ModelQueryBuilderContract<LucidModel>): void {
  const isGroupLimit = query.clone().toQuery().includes('adonis_group_limit_counter')
  const inner = (query.knexQuery as unknown as { _single?: { table?: unknown } })._single?.table
  const mode =
    isGroupLimit && inner && typeof inner === 'object'
      ? getSoftDeletesMode(inner)
      : getSoftDeletesMode(query)
  if (mode === 'with') return

  const column = query.model.$getColumn('deletedAt')?.columnName
  if (!column) throw new E_MODEL_SOFT_DELETE(query.model.name)

  const innerTable = (inner as { _single?: { table?: unknown } } | undefined)?._single?.table
  const tableReference = isGroupLimit
    ? (aliasFromTable(innerTable) ?? resolveTableReference(query))
    : resolveTableReference(query)
  const reference = `${tableReference}.${column}`
  const filter = mode === 'only' ? 'whereNotNull' : 'whereNull'

  if (isGroupLimit) {
    if (inner && typeof inner === 'object' && filter in inner) {
      ;(inner as FilterableQuery)[filter](reference)
      return
    }
  }

  query.wrapExisting()
  query[filter](reference)
}

export function installModePropagation(builder: { prototype: object }): void {
  const prototype = builder.prototype as {
    applyQueryFlags(query: ScopedQuery): void
  }
  if (Object.hasOwn(prototype, PATCHED)) return

  const original = prototype.applyQueryFlags
  Object.defineProperty(prototype, 'applyQueryFlags', {
    configurable: true,
    value(this: ScopedQuery, clone: ScopedQuery) {
      original.call(this, clone)
      setSoftDeletesMode(clone, getSoftDeletesMode(this))
    },
  })
  Object.defineProperty(prototype, PATCHED, { value: true })
}
