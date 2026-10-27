/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/** Compile-only contracts for the installed package in an AdonisJS app. */

import type { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel } from '@adonisjs/lucid/orm'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { hasSoftDeletes, SoftDeletes } from '@kevinjohn/lucid-soft-deletes'
import type {
  SOFT_DELETES,
  SoftDeletesInstance,
  SoftDeletesModel,
} from '@kevinjohn/lucid-soft-deletes'
import User from '#models/user'

class ExtendedUser extends User {
  declare role: string
}

class Post extends compose(BaseModel, SoftDeletes) {
  declare title: string
}

class RelatedUser extends User {}

interface RelatedUser {
  posts: HasMany<typeof Post>
}

class TenantBase extends BaseModel {
  declare tenantId: number
}

class TenantUser extends compose(TenantBase, SoftDeletes) {
  declare username: string
}

const WithMarker = <T extends new (...args: any[]) => object>(superclass: T) =>
  class extends superclass {
    marker = 'present' as const
  }

class DeletesThenMarker extends compose(BaseModel, SoftDeletes, WithMarker) {}
class MarkerThenDeletes extends compose(BaseModel, WithMarker, SoftDeletes) {}

type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

export type ConsumerTypeAssertions = [
  Assert<Equal<User['deletedAt'], DateTime | null>>,
  Assert<Equal<Awaited<ReturnType<User['restore']>>, User>>,
  Assert<Equal<Awaited<ReturnType<User['forceDelete']>>, void>>,
  Assert<Equal<(typeof User)[typeof SOFT_DELETES], true>>,
  Assert<User extends SoftDeletesInstance ? true : false>,
  Assert<IsAny<ReturnType<User['useTransaction']>> extends false ? true : false>,
  Assert<IsAny<Awaited<ReturnType<ExtendedUser['restore']>>> extends false ? true : false>,
  TenantUser['tenantId'],
  TenantUser['username'],
  DeletesThenMarker['marker'],
  MarkerThenDeletes['marker'],
]

function checkTypes(user: User, extended: ExtendedUser, related: RelatedUser) {
  const queryResult: Promise<User | null> = User.query().withTrashed().first()
  const restoreCount: Promise<number> = User.query().onlyTrashed().restore()
  const instanceRestore: Promise<User> = user.restore()
  const subclassRestore: Promise<ExtendedUser> = extended.restore()
  const transactionResult: User = user.useTransaction({} as TransactionClientContract)

  async function checkStaticResults() {
    const withTrashed = await ExtendedUser.withTrashed().firstOrFail()
    const role: string = withTrashed.role
    const fromBuilder = await ExtendedUser.query().withTrashed().firstOrFail()
    const builderRole: string = fromBuilder.role
    void role
    void builderRole
  }

  related.related('posts').query().withTrashed().groupLimit(1)
  related.related('posts').query().onlyTrashed().groupLimit(1)
  RelatedUser.query().preload('posts', (posts) => posts.withTrashed())

  // @ts-expect-error A missing relation cannot be preloaded.
  RelatedUser.query().preload('missing')

  const plainModel: typeof BaseModel = BaseModel
  // @ts-expect-error A plain Lucid model cannot call a soft-delete query macro.
  plainModel.query().withTrashed()
  if (hasSoftDeletes(plainModel)) {
    const marked: SoftDeletesModel = plainModel
    void marked
  }

  const tenantId: number = new TenantUser().tenantId
  const username: string = new TenantUser().username
  const firstMarker: 'present' = new DeletesThenMarker().marker
  const secondMarker: 'present' = new MarkerThenDeletes().marker

  void queryResult
  const softDeleted: Promise<number> = User.query().softDelete()
  const forceDeleted: Promise<number> = User.query().onlyTrashed().forceDelete()
  void softDeleted
  void forceDeleted
  void restoreCount
  void instanceRestore
  void subclassRestore
  void transactionResult
  void checkStaticResults
  void tenantId
  void username
  void firstMarker
  void secondMarker
}

void checkTypes
