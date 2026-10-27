/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/** Compile-time contracts for soft-delete builder macros. */

import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { SoftDeletesModel } from '../../index.js'
import type { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { User } from './mixin.js'

type IsAny<Value> = 0 extends 1 & Value ? true : false
type Assert<Condition extends true> = Condition

export type BuilderTypeAssertions = [
  Assert<IsAny<ReturnType<typeof User.query>> extends false ? true : false>,
  ModelQueryBuilderContract<typeof User, User>,
]

export function assertBuilderTypeContracts(): void {
  const original = User.query()
  const withTrashed = original.withTrashed()
  const onlyTrashed = original.onlyTrashed()
  const cloned = withTrashed.clone()
  const restored: Promise<number> = onlyTrashed.restore()
  const first: Promise<User | null> = withTrashed.first()

  const softDeleted: Promise<number> = original.softDelete()
  const forceDeleted: Promise<number> = cloned.forceDelete()
  void softDeleted
  void forceDeleted
  void cloned
  void restored
  void first

  const bare = undefined as unknown as ModelQueryBuilder
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
