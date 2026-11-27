/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { compose } from '@adonisjs/core/helpers'
import type Configure from '@adonisjs/core/commands/configure'
import { BaseModel } from '@adonisjs/lucid/orm'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { test } from '@japa/runner'
import { configure, withSoftDeletes } from '../../index.ts'
import type {
  SoftDeletesConstructor,
  SoftDeletesInstance,
  SoftDeletesStatics,
} from '../../index.ts'

class User extends compose(BaseModel, withSoftDeletes) {}

interface User {
  id: number
  username: string
  posts: HasMany<typeof Post>
}

class Post extends compose(BaseModel, withSoftDeletes) {}

interface Post {
  id: number
  title: string
}

class TenantBase extends BaseModel {}

interface TenantBase {
  tenantId: number
}

class TenantUser extends compose(TenantBase, withSoftDeletes) {}

interface TenantUser {
  username: string
}

const WithMarker = <T extends new (...args: any[]) => object>(superclass: T) =>
  class extends superclass {
    marker = 'present' as const
  }

class DeletesThenMarker extends compose(BaseModel, withSoftDeletes, WithMarker) {}
interface DeletesThenMarker {
  marker: 'present'
}

class MarkerThenDeletes extends compose(BaseModel, WithMarker, withSoftDeletes) {}
interface MarkerThenDeletes {
  marker: 'present'
}

test.group('Mixin types', () => {
  test('preserves instance, relation, subclass, and composition types', ({ expectTypeOf }) => {
    expectTypeOf<Awaited<ReturnType<User['restore']>>>().not.toBeAny()
    expectTypeOf<ReturnType<User['useTransaction']>>().not.toBeAny()
    expectTypeOf<DeletesThenMarker['marker']>().toEqualTypeOf<'present'>()
    expectTypeOf<MarkerThenDeletes['marker']>().toEqualTypeOf<'present'>()
    expectTypeOf<TenantUser['tenantId']>().toEqualTypeOf<number>()

    const check = () => {
      const user = new User()
      expectTypeOf(user.restore()).toEqualTypeOf<Promise<User>>()
      expectTypeOf(user.useTransaction({} as TransactionClientContract)).toEqualTypeOf<User>()

      const assertQueryResults = async (): Promise<void> => {
        const staticUser = await User.withTrashed().firstOrFail()
        expectTypeOf(staticUser.username).toEqualTypeOf<string>()
        const queryUser = await User.query().withTrashed().firstOrFail()
        expectTypeOf(queryUser.username).toEqualTypeOf<string>()
        const firstUser = await User.query().withTrashed().first()
        expectTypeOf(firstUser).toEqualTypeOf<User | null>()
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
      expectTypeOf(tenant.tenantId).toEqualTypeOf<number>()
      expectTypeOf(tenant.username).toEqualTypeOf<string>()
      expectTypeOf(new DeletesThenMarker().marker).toEqualTypeOf<'present'>()
      expectTypeOf(new MarkerThenDeletes().marker).toEqualTypeOf<'present'>()
    }

    expectTypeOf(check).toBeFunction()
  })

  test('documented root types describe what compose(..., withSoftDeletes) infers', ({
    expectTypeOf,
  }) => {
    expectTypeOf(withSoftDeletes(BaseModel)).toExtend<SoftDeletesConstructor<typeof BaseModel>>()
    expectTypeOf(User).toExtend<SoftDeletesStatics>()
    expectTypeOf(new User()).toExtend<SoftDeletesInstance>()
    expectTypeOf(configure).toEqualTypeOf<(command: Configure) => Promise<void>>()

    const lifecycleOnly: SoftDeletesInstance = {
      trashed: false,
      $forceDelete: false,
      restore() {
        return Promise.resolve(this)
      },
      forceDelete: () => Promise.resolve(),
    }
    expectTypeOf(lifecycleOnly).toEqualTypeOf<SoftDeletesInstance>()

    const check = () => {
      // @ts-expect-error PLAIN_MODEL_IS_NOT_SOFT_DELETES_STATICS
      const plainStatics: SoftDeletesStatics = BaseModel
      void plainStatics
    }

    expectTypeOf(check).toBeFunction()
  })
})
