/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

export const SOFT_DELETES_MODE = 'softDeletesMode' as const
export type SoftDeletesMode = 'default' | 'with' | 'only'

export type ScopedQuery = {
  [SOFT_DELETES_MODE]?: SoftDeletesMode
  tableAlias?: string
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
