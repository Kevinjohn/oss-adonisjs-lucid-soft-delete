/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { getSoftDeletesMode, setSoftDeletesMode, type ScopedQuery } from './mode.js'

const PATCHED = Symbol.for('@kevinjohn/lucid-soft-deletes/patched')

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
      clone.tableAlias = this.tableAlias
    },
  })
  Object.defineProperty(prototype, PATCHED, { value: true })
}
