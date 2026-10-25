/*
 * Compile-time contracts for soft-delete builder macros.
 */

import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
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

  void cloned
  void restored
  void first

  const bare = undefined as unknown as ModelQueryBuilder
  // @ts-expect-error BARE_BUILDER_HAS_NO_PROVEN_SOFT_DELETE_CAPABILITY
  bare.withTrashed()
}
