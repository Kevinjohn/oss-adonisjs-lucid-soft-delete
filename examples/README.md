# Examples: soft-deleted users in an AdonisJS 7 app

Follow the complete [recycle-bin tutorial](../docs/tutorial.md) to install the package from this
source checkout, configure a fixture app, migrate its database, and exercise create, hide, list,
restore, and permanent purge. It uses the installed-consumer app under `examples/app/`, which also
serves as the packed-package test fixture for `pnpm test:consumer`.

This page keeps focused examples of the public methods for reference. It is not a complete method
catalog; the package README describes the full lifecycle contract.

## 1. Migration

```ts
// database/migrations/<timestamp>_add_deleted_at_to_users.ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddDeletedAtToUsers extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('deleted_at')
    })
  }
}
```

## 2. Model

```ts
// app/models/user.ts
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

export default class User extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string
}
```

The mixin declares `deletedAt` and the `trashed` getter. Add nothing else for the default column name.

## 3. Controller

```ts
// app/controllers/users_controller.ts
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'

export default class UsersController {
  /** Active users only. The default scope adds `deleted_at IS NULL`. */
  async index() {
    return User.query().orderBy('email')
  }

  /** Trashed users only, for an admin "bin" view. */
  async trashed() {
    return User.query().onlyTrashed().orderBy('deleted_at', 'desc')
  }

  /** Active and trashed together. */
  async everyone() {
    return User.withTrashed().orderBy('email')
  }

  /** Soft delete: sets `deleted_at`, keeps the row. */
  async destroy({ params, response }: HttpContext) {
    const user = await User.findOrFail(params.id)
    await user.delete()
    return response.noContent()
  }

  /** Soft delete without running model hooks, for example from a bulk import. */
  async destroyQuietly({ params, response }: HttpContext) {
    const user = await User.findOrFail(params.id)
    await user.deleteQuietly()
    return response.noContent()
  }

  /** Restore one trashed user. `findOrFail` would not see it, so read with `withTrashed()`. */
  async restore({ params }: HttpContext) {
    const user = await User.withTrashed().where('id', params.id).firstOrFail()
    await user.restore()
    return user
  }

  /** Restore every trashed user matching a filter. Returns the affected row count. */
  async restoreMany({ request }: HttpContext) {
    const domain = request.input('domain')
    const restored = await User.query()
      .onlyTrashed()
      .where('email', 'like', `%@${domain}`)
      .restore()
    return { restored }
  }

  /** Physical DELETE. Works on active and trashed rows. */
  async purge({ params, response }: HttpContext) {
    const user = await User.withTrashed().where('id', params.id).firstOrFail()
    await user.forceDelete()
    return response.noContent()
  }
}
```

## 4. Routes

```ts
// start/routes.ts
import router from '@adonisjs/core/services/router'
const UsersController = () => import('#controllers/users_controller')

router.get('/users', [UsersController, 'index'])
router.get('/users/trashed', [UsersController, 'trashed'])
router.get('/users/everyone', [UsersController, 'everyone'])
router.delete('/users/:id', [UsersController, 'destroy'])
router.delete('/users/:id/quietly', [UsersController, 'destroyQuietly'])
router.post('/users/:id/restore', [UsersController, 'restore'])
router.post('/users/restore', [UsersController, 'restoreMany'])
router.delete('/users/:id/purge', [UsersController, 'purge'])
```

## What to expect

| Call                      | Rows touched                                              |
| ------------------------- | --------------------------------------------------------- |
| `DELETE /users/1`         | `UPDATE users SET deleted_at = now WHERE id = 1`          |
| `DELETE /users/1/quietly` | the same `UPDATE`, without model hooks                    |
| `GET /users`              | `WHERE users.deleted_at IS NULL`                          |
| `GET /users/trashed`      | `WHERE users.deleted_at IS NOT NULL`                      |
| `GET /users/everyone`     | no `deleted_at` predicate                                 |
| `POST /users/1/restore`   | `UPDATE users SET deleted_at = NULL WHERE id = 1`         |
| `POST /users/restore`     | one `UPDATE` with the filter and `deleted_at IS NOT NULL` |
| `DELETE /users/1/purge`   | `DELETE FROM users WHERE id = 1`                          |

Relations, pagination, transactions and the cases the scope does not cover are in the
[README](../README.md#scope-contract).

## Caller-owned transaction service

Policy and bookkeeping belong to the application. This sketch uses a fictional notes table;
replace `mayRemove` with the application's policy. Send external notifications after this function
resolves, because model after-hooks run before commit.

```ts
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'

export async function removeUser(id: number, mayRemove: (user: User) => boolean) {
  return db.transaction(async (trx) => {
    const user = await User.query({ client: trx }).where('id', id).firstOrFail()
    if (!mayRemove(user)) throw new Error('Removal is not permitted')
    await user.delete()
    await trx.table('operation_notes').insert({ user_id: id, message: 'removed' })
    return user.id
  })
}
```

A policy rejection before deletion changes neither table. An error after deletion rolls back both
writes. Rollback does not rewind a retained model instance; discard and refetch it before reuse.

## Installed lifecycle evidence

From the repository root, run `pnpm test:consumer` and
`pnpm test:consumer --compatibility=minimum` with Node 24 and pnpm 11. Both commands pack the
package, install it into a clean fixture app, migrate, typecheck, build, and run the consumer
suite, including `examples/app/tests/lifecycle.spec.ts`.

- The package owns deletion timestamps, lifecycle methods, read scopes, and use of the supplied client.
- The application owns tenant predicates, authorization, archive state, bookkeeping, and transaction boundaries.
- `withTrashed()` on a root query does not change related queries. Choose it separately for each preload or aggregate callback that needs deleted rows.
- These fictional fixture tables establish package behavior only. CapacityLens integration evidence remains outstanding in [capacitylens#1640](https://github.com/Kevinjohn/capacitylens/issues/1640); this repository does not test or claim its service paths, policies, or migration status.

## Application-owned recovery groups

The [group recovery cookbook recipe](../docs/cookbook.md#recover-an-application-owned-deletion-group)
composes the existing count-returning mutation APIs into a one-use recovery lifecycle. The
maintained service, generic fixture migration and installed-consumer tests live in this example
app; group validity, tenant authorization, cleanup eligibility and the transaction boundary belong
to the application. It does not require a richer bulk-result API or a package-owned undo framework.

The recipe keeps a fresh group identity and a current deletion association separately from the
soft-delete timestamp. This prevents an earlier group from restoring or purging a later deletion,
even if their deletion timestamps happen to be equal. Both installed-consumer commands above run
the same service functions shown in the cookbook.
