/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

/** Compile-time contracts for soft-delete builder macros. */

import type { TestContext } from '@japa/runner/core'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type {
  SoftDeletesModel,
  SoftDeleteReceipt,
  RestoreReceipt,
  ForceDeleteReceipt,
} from '../../index.js'
import type { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { User } from './mixin.js'

export function assertBuilderTypeContracts(expectTypeOf: TestContext['expectTypeOf']): void {
  const original = User.query()
  const withTrashed = original.withTrashed()
  const onlyTrashed = original.onlyTrashed()
  const cloned = withTrashed.clone()
  expectTypeOf(original).not.toBeAny()
  expectTypeOf(onlyTrashed.restore()).toEqualTypeOf<Promise<number>>()
  expectTypeOf(withTrashed.first()).toEqualTypeOf<Promise<User | null>>()
  expectTypeOf(original.softDelete()).toEqualTypeOf<Promise<number>>()
  expectTypeOf(cloned.forceDelete()).toEqualTypeOf<Promise<number>>()

  const bare = undefined as unknown as ModelQueryBuilder
  expectTypeOf(original.softDelete({ receipt: true })).toEqualTypeOf<Promise<SoftDeleteReceipt>>()
  expectTypeOf(onlyTrashed.restore({ receipt: true })).toEqualTypeOf<Promise<RestoreReceipt>>()
  expectTypeOf(cloned.forceDelete({ receipt: true })).toEqualTypeOf<Promise<ForceDeleteReceipt>>()
  expectTypeOf(original.softDelete({ receipt: false })).toEqualTypeOf<Promise<number>>()
  expectTypeOf(original.softDelete({})).toEqualTypeOf<Promise<number>>()
  expectTypeOf(original.softDelete({ receipt: Math.random() > 0.5 })).toEqualTypeOf<
    Promise<number | SoftDeleteReceipt>
  >()
  // @ts-expect-error UNKNOWN_RECEIPT_OPTION
  original.softDelete({ reciept: true })
  // @ts-expect-error BARE_BUILDER_HAS_NO_PROVEN_SOFT_DELETE_CAPABILITY
  bare.softDelete({ receipt: true })
  // @ts-expect-error BARE_BUILDER_HAS_NO_PROVEN_SOFT_DELETE_CAPABILITY
  bare.withTrashed()
  // @ts-expect-error BARE_BUILDER_HAS_NO_PROVEN_SOFT_DELETE_CAPABILITY
  bare.softDelete()
  // @ts-expect-error BARE_BUILDER_HAS_NO_PROVEN_SOFT_DELETE_CAPABILITY
  bare.forceDelete()
}

/** A helper written once for every soft-delete model keeps the macros. */
export function includeTrashed<Model extends SoftDeletesModel>(
  query: ModelQueryBuilderContract<Model>
): ModelQueryBuilderContract<Model> {
  return query.withTrashed()
}

export function restoreTrashed<Model extends SoftDeletesModel>(model: Model): Promise<number> {
  return model.query().onlyTrashed().restore()
}
