/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { RawBuilderContract } from '@adonisjs/lucid/types/querybuilder'
import { E_MODEL_SOFT_DELETE } from './errors.js'
import { getSoftDeletesMode } from './mode.js'
import {
  aliasFromTable,
  qualifiedColumnReference,
  resolveTableReference,
} from './table_reference.js'
import { addScopeFilter, removeScopeFilter } from './where_stack.js'

type FilterableQuery = {
  whereNull(column: string | RawBuilderContract | KnexRawReference): unknown
  whereNotNull(column: string | RawBuilderContract | KnexRawReference): unknown
}

type KnexRawReference = { toSQL(): unknown }

type KnexBuilderLike = {
  _single?: { table?: unknown }
  client: { raw(sql: string): KnexRawReference }
  queryContext(): unknown
}

type GroupLimit = {
  /** Lucid's inner `row_number()` builder; the mode and the filter live here. */
  inner: object
  /** Alias of the relation table inside that builder, when one was given. */
  alias: string | undefined
}

/**
 * Detect Lucid's group-limit path for has-many and many-to-many relations. Lucid builds a
 * `row_number()` subquery named `adonis_group_limit_counter` and executes a fresh outer builder
 * whose table is the inner Knex builder. The filter must land on that inner builder so trashed
 * rows do not consume a parent's limit. The SQL is read from a clone; the query that will execute
 * is never previewed.
 */
function resolveGroupLimit(query: ModelQueryBuilderContract<LucidModel>): GroupLimit | undefined {
  if (!query.clone().toQuery().includes('adonis_group_limit_counter')) return undefined
  const inner = (query.knexQuery as unknown as KnexBuilderLike)._single?.table
  if (!inner || typeof inner !== 'object') return undefined
  return { inner, alias: aliasFromTable((inner as KnexBuilderLike)._single?.table) }
}

function deletedAtColumn(query: ModelQueryBuilderContract<LucidModel>): string {
  const column = query.model.$getColumn('deletedAt')?.columnName
  if (!column) throw new E_MODEL_SOFT_DELETE(query.model.name)
  return column
}

export function applyScope(query: ModelQueryBuilderContract<LucidModel>): void {
  const groupLimit = resolveGroupLimit(query)
  const mode = getSoftDeletesMode(groupLimit?.inner ?? query)
  if (mode === 'with') return removeScopeFilter(query)

  const column = deletedAtColumn(query)
  const reference = qualifiedColumnReference(
    query,
    column,
    groupLimit?.alias ?? resolveTableReference(query),
    groupLimit?.alias !== undefined,
    groupLimit ? (groupLimit.inner as KnexBuilderLike).queryContext() : undefined
  )
  const filter = mode === 'only' ? 'whereNotNull' : 'whereNull'

  if (groupLimit && filter in groupLimit.inner) {
    const innerReference =
      typeof reference === 'string'
        ? reference
        : reference.toKnex(
            (groupLimit.inner as KnexBuilderLike).client as Parameters<
              RawBuilderContract['toKnex']
            >[0]
          )
    ;(groupLimit.inner as FilterableQuery)[filter](innerReference)
    return
  }

  addScopeFilter(query, filter, reference)
}

/**
 * Scope a relation sub-query (`withCount`, `withAggregate`, `has`, `whereHas`, `doesntHave`,
 * `loadCount`, `loadAggregate`). Lucid never runs fetch hooks for these, and they have no
 * group-limit path. Reading SQL from a clone would recurse through the same hook, so the
 * group-limit detection is skipped here on purpose.
 */
export function applySubQueryScope(query: ModelQueryBuilderContract<LucidModel>): void {
  const mode = getSoftDeletesMode(query)
  if (mode === 'with') return removeScopeFilter(query)

  const reference = qualifiedColumnReference(query, deletedAtColumn(query))
  addScopeFilter(query, mode === 'only' ? 'whereNotNull' : 'whereNull', reference)
}
