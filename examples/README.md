# Example: soft-deleted users in an AdonisJS 7 app

Copy these four pieces into an AdonisJS 7 application that has run
`node ace configure @kevinjohn/lucid-soft-deletes`. Together they cover every public method the
package adds. `examples/app/` next to this file is the installed-package test fixture, not an example
to copy; it exists so `pnpm test:consumer` can install the packed tarball into a real app.

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
    return User.query().onlyTrashed().orderBy('deletedAt', 'desc')
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
router.post('/users/:id/restore', [UsersController, 'restore'])
router.post('/users/restore', [UsersController, 'restoreMany'])
router.delete('/users/:id/purge', [UsersController, 'purge'])
```

## What to expect

| Call                    | Rows touched                                              |
| ----------------------- | --------------------------------------------------------- |
| `DELETE /users/1`       | `UPDATE users SET deleted_at = now WHERE id = 1`          |
| `GET /users`            | `WHERE users.deleted_at IS NULL`                          |
| `GET /users/trashed`    | `WHERE users.deleted_at IS NOT NULL`                      |
| `GET /users/everyone`   | no `deleted_at` predicate                                 |
| `POST /users/1/restore` | `UPDATE users SET deleted_at = NULL WHERE id = 1`         |
| `POST /users/restore`   | one `UPDATE` with the filter and `deleted_at IS NOT NULL` |
| `DELETE /users/1/purge` | `DELETE FROM users WHERE id = 1`                          |

Relations, pagination, transactions and the cases the scope does not cover are in the
[README](../README.md#scope-contract).
