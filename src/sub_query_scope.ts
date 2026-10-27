/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import { hasSoftDeletes } from './guard.js'
import { applySubQueryScope } from './scope.js'
import { reapplyScopeFilter } from './where_stack.js'

const PATCHED = Symbol.for('@kevinjohn/lucid-soft-deletes/sub-query-scope')

type SubQueryLike = ModelQueryBuilderContract<LucidModel> & {
  /** `true` on Lucid's relation sub-query builders; absent on plain model builders. */
  isRelatedSubQuery?: boolean
  /** `true` for the nested builder Lucid hands to a `where` callback inside a sub-query. */
  isChildQuery?: boolean
  applyWhere(): void
}

/**
 * Scope relation sub-queries whose related model uses soft deletes. Every way Lucid renders a
 * sub-query (`toKnex()`, `toSQL()`) flushes `whereStack` through `applyWhere()`, after
 * `prepare()` has added the relation constraint. Wrapping that method on the model query
 * builder prototype catches every relation type without reaching Lucid's unexported sub-query
 * classes. For other non-child builders, reapply an existing hook-installed filter after
 * later hooks have appended predicates.
 */
export function installSubQueryScope(builder: { prototype: object }): void {
  const prototype = builder.prototype as SubQueryLike
  if (Object.hasOwn(prototype, PATCHED)) return

  const original = prototype.applyWhere
  Object.defineProperty(prototype, 'applyWhere', {
    configurable: true,
    writable: true,
    value(this: SubQueryLike) {
      if (this.isRelatedSubQuery === true && !this.isChildQuery && hasSoftDeletes(this.model)) {
        applySubQueryScope(this)
      } else if (!this.isChildQuery) {
        reapplyScopeFilter(this)
      }
      original.call(this)
    },
  })
  Object.defineProperty(prototype, PATCHED, { value: true })
}
