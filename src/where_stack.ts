/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

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

/** Collect the caller's where groups, unwrapping a replay node and dropping scope filters. */
function collectGroups(grouped: GroupedQuery): WhereNode[][] {
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
  return groups
}

/** Keep the caller's groups in one non-draining where group. */
function rebuildStack(grouped: GroupedQuery, groups: WhereNode[][]): void {
  grouped.whereStack = [[]]
  if (groups.length) {
    grouped.whereStack[0].push({
      method: 'where',
      args: [(knexQuery: KnexWhere) => replayGroups(grouped, knexQuery, groups)],
      [SCOPE_NODE]: groups,
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
  rebuildStack(grouped, collectGroups(grouped))
  query[filter](reference)
  grouped.whereStack[0].at(-1)![SCOPE_NODE] = true
}

/** Remove a scope filter left by an earlier run. A builder that never ran is left untouched. */
export function removeScopeFilter(query: ModelQueryBuilderContract<LucidModel>): void {
  const grouped = query as unknown as GroupedQuery
  const hasFilter = grouped.whereStack.some((collection) =>
    collection.some((node) => node[SCOPE_NODE] === true)
  )
  if (hasFilter) rebuildStack(grouped, collectGroups(grouped))
}

/** Regroup predicates appended after a hook installed the scope, retaining that filter's mode. */
export function reapplyScopeFilter(query: ModelQueryBuilderContract<LucidModel>): void {
  const grouped = query as unknown as GroupedQuery
  const filter = grouped.whereStack.flat().find((node) => node[SCOPE_NODE] === true)
  if (filter) {
    addScopeFilter(query, filter.method as 'whereNull' | 'whereNotNull', filter.args[0] as string)
  }
}
