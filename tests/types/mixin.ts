/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/** Compile-time contracts for the public soft-delete mixin. */

import { compose } from '@adonisjs/core/helpers'
import { BaseModel } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { SoftDeletes } from '../../index.js'

class User extends compose(BaseModel, SoftDeletes) {}

interface User {
  id: number
  username: string
  posts: HasMany<typeof Post>
}

class Post extends compose(BaseModel, SoftDeletes) {}

interface Post {
  id: number
  title: string
}

class TenantBase extends BaseModel {}

interface TenantBase {
  tenantId: number
}

class TenantUser extends compose(TenantBase, SoftDeletes) {}

interface TenantUser {
  username: string
}

const WithMarker = <T extends new (...args: any[]) => object>(superclass: T) =>
  class extends superclass {
    marker = 'present' as const
  }

class DeletesThenMarker extends compose(BaseModel, SoftDeletes, WithMarker) {}
interface DeletesThenMarker {
  marker: 'present'
}

class MarkerThenDeletes extends compose(BaseModel, WithMarker, SoftDeletes) {}
interface MarkerThenDeletes {
  marker: 'present'
}

type IsAny<Value> = 0 extends 1 & Value ? true : false
type Assert<Condition extends true> = Condition

export type MixinTypeAssertions = [
  Assert<IsAny<Awaited<ReturnType<User['restore']>>> extends false ? true : false>,
  Assert<IsAny<ReturnType<User['useTransaction']>> extends false ? true : false>,
  DeletesThenMarker['marker'],
  MarkerThenDeletes['marker'],
  TenantUser['tenantId'],
]

export function assertMixinTypeContracts(): void {
  const user = new User()
  const restored: Promise<User> = user.restore()
  const transactionResult: User = user.useTransaction({} as TransactionClientContract)

  void restored
  void transactionResult

  async function assertQueryResults(): Promise<void> {
    const staticUser = await User.withTrashed().firstOrFail()
    const staticName: string = staticUser.username
    const queryUser = await User.query().withTrashed().firstOrFail()
    const queryName: string = queryUser.username
    const firstUser: User | null = await User.query().withTrashed().first()

    void staticName
    void queryName
    void firstUser
  }

  void assertQueryResults

  user.related('posts').query().withTrashed().groupLimit(1)
  user.related('posts').query().onlyTrashed().groupLimit(1)
  User.query().preload('posts', (posts) => {
    posts.withTrashed()
  })

  // @ts-expect-error INVALID_PRELOAD_RELATION
  User.query().preload('missing')

  class PlainModel extends BaseModel {}

  // @ts-expect-error SOFT_DELETE_METHOD_REQUIRES_CAPABILITY
  PlainModel.query().withTrashed()

  const tenant = new TenantUser()
  const tenantId: number = tenant.tenantId
  const username: string = tenant.username
  const firstMarker: 'present' = new DeletesThenMarker().marker
  const secondMarker: 'present' = new MarkerThenDeletes().marker

  void tenantId
  void username
  void firstMarker
  void secondMarker
}

export { User }
