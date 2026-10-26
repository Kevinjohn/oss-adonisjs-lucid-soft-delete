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
  tableAlias?: string
}

type FilterableQuery = {
  whereNull(column: string): unknown
  whereNotNull(column: string): unknown
}

const PATCHED = Symbol.for('@kevinjohn/lucid-soft-deletes/patched')
const SCOPE_NODE = Symbol.for('@kevinjohn/lucid-soft-deletes/scope-node')

type WhereNode = { method: string; args: unknown[]; [SCOPE_NODE]?: WhereNode[][] | true }
type KnexWhere = Record<string, (...args: unknown[]) => unknown>
type GroupedQuery = {
  whereStack: WhereNode[][]
  getWrappingMethod(method: string): { method: string; wrappingMethod: string }
}

/** Apply where groups the way Lucid's `applyWhere()` does, without draining them. */
function replayGroups(query: GroupedQuery, knexQuery: KnexWhere, groups: WhereNode[][]): void {
  if (groups.length === 1) {
    for (const { method, args } of groups[0]) knexQuery[method](...args)
    return
  }
  for (const [first, ...rest] of groups) {
    const { method, wrappingMethod } = query.getWrappingMethod(first.method)
    knexQuery[wrappingMethod]((subquery: KnexWhere) => {
      subquery[method](...first.args)
      for (const node of rest) subquery[node.method](...node.args)
    })
  }
}

/**
 * Add the scope filter after the caller's predicates as one where group.
 * Lucid's `applyWhere()` empties `whereStack` when it holds several groups, which would drop the
 * caller's predicates when a builder runs twice. A filter from an earlier run is replaced.
 */
export function addScopeFilter(
  query: ModelQueryBuilderContract<LucidModel>,
  filter: 'whereNull' | 'whereNotNull',
  reference: string
): void {
  const grouped = query as unknown as GroupedQuery
  const groups: WhereNode[][] = []
  for (const collection of grouped.whereStack) {
    let target: WhereNode[] | undefined
    for (const node of collection) {
      const saved = node[SCOPE_NODE]
      if (Array.isArray(saved)) {
        groups.push(...saved.map((group) => [...group]))
        target = groups.at(-1)
      } else if (!saved) {
        if (!target) groups.push((target = []))
        target.push(node)
      }
    }
  }

  grouped.whereStack = [[]]
  if (groups.length) {
    grouped.whereStack[0].push({
      method: 'where',
      args: [(knexQuery: KnexWhere) => replayGroups(grouped, knexQuery, groups)],
      [SCOPE_NODE]: groups,
    })
  }
  query[filter](reference)
  grouped.whereStack[0].at(-1)![SCOPE_NODE] = true
}

export function setSoftDeletesMode<Query extends object>(
  query: Query,
  mode: SoftDeletesMode
): Query {
  ;(query as ScopedQuery)[SOFT_DELETES_MODE] = mode
  return query
}

export function getSoftDeletesMode(query: object): SoftDeletesMode {
  return (query as ScopedQuery)[SOFT_DELETES_MODE] ?? 'default'
}

export function resolveTableReference(query: ModelQueryBuilderContract<LucidModel>): string {
  const tableAlias = (query as { tableAlias?: string }).tableAlias
  if (tableAlias) return tableAlias

  const table = (query.knexQuery as unknown as { _single?: { table?: unknown } })._single?.table
  if (typeof table === 'string') {
    const alias = table.match(/\s+as\s+(\w+)$/i)?.[1]
    if (alias) return alias
  }

  return query.model.table
}

export function applyScope(query: ModelQueryBuilderContract<LucidModel>): void {
  const mode = getSoftDeletesMode(query)
  if (mode === 'with') return

  const column = query.model.$getColumn('deletedAt')?.columnName
  if (!column) throw new E_MODEL_SOFT_DELETE(query.model.name)

  const reference = `${resolveTableReference(query)}.${column}`
  const filter = mode === 'only' ? 'whereNotNull' : 'whereNull'
  const isGroupLimit = query.clone().toQuery().includes('adonis_group_limit_counter')

  if (isGroupLimit) {
    const inner = (query.knexQuery as unknown as { _single?: { table?: unknown } })._single?.table
    if (inner && typeof inner === 'object' && filter in inner) {
      ;(inner as FilterableQuery)[filter](reference)
      return
    }
  }

  addScopeFilter(query, filter, reference)
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
      clone[SOFT_DELETES_MODE] = this[SOFT_DELETES_MODE]
      clone.tableAlias = this.tableAlias
    },
  })
  Object.defineProperty(prototype, PATCHED, { value: true })
}
