# @kevinjohn/lucid-soft-deletes

> Works with AdonisJS 7 and Lucid 22

Docs for [AdonisJS v5](https://github.com/lookinlab/adonis-lucid-soft-deletes/tree/v1)

[![npm-image]][npm-url] [![license-image]][license-url] [![typescript-image]][typescript-url]

This addon adds the functionality to soft deletes Lucid Models through the `deleted_at` flag

> Works with `@adonisjs/lucid@^22.0.0`

Sometimes use the `deleted_at` flag for soft deletes could be not good way. More [about it](https://brandur.org/soft-deletion)

## Introduction

Sometimes you may wish to "no-delete" a model from database.
When models are soft deleted, they are not actually removed from your database.
Instead, a `deleted_at` attribute is set on the model indicating the date
and time at which the model was "deleted".

:point_right: The SoftDeletes mixin will automatically add the `deleted_at` attribute
as Luxon / DateTime instance.

## Installation

Install the package with pnpm.

```bash
pnpm add @kevinjohn/lucid-soft-deletes
```

After install call `configure`:

```bash
node ace configure @kevinjohn/lucid-soft-deletes
```

## Usage

Make sure to register the provider inside `adonisrc.ts` file.

```ts
providers: [
  // ...
  () => import('@kevinjohn/lucid-soft-deletes/provider'),
]
```

You should add the `deleted_at` column to your database tables for models with soft deletes.

```ts
// migrations/1234566666_users.ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class Users extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      // ...
      table.timestamp('deleted_at').nullable()
    })
  }
  // ...
}
```

### Applying Soft Deletes to a Model

```ts
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

export default class User extends compose(BaseModel, SoftDeletes) {
  // ...columns and props
}
```

Now, when you call the `.delete()` method on the model, the `deleted_at` (`customDeletedAtColumn`) column
will be set to the current date and time. However, the model's database record will be left in the table.

```ts
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'

export default class UsersController {
  /**
   * Delete user by id
   * DELETE /users/:id
   */
  async destroy({ params, response }: HttpContext) {
    const user = await User.findOrFail(params.id)
    await user.delete()

    return user // or response.noContent()
  }
}
```

> :boom: Soft delete only works for model instances. `await User.query().delete()` as before
> will delete models from database

:point_right: When querying a model that uses soft deletes, the soft deleted models
will automatically be excluded from all query results.

To determine if a given model instance has been soft deleted, you may use the `.trashed` getter:

```ts
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'

export default class UsersController {
  /**
   * Get user by id
   * GET /users/:id
   */
  async show({ params }: HttpContext) {
    const user = await User.withTrashed().where('id', params.id).firstOrFail()
    if (user.trashed) {
      return response.forbidden()
    }
    return user
  }
}
```

### Set custom column name for `deletedAt`

```ts
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

export default class User extends compose(BaseModel, SoftDeletes) {
  // ...columns and props

  @column.dateTime({ columnName: 'customDeletedAtColumn' })
  declare deletedAt: DateTime | null
}
```

### Restoring Soft Deleted Models

To restore a soft deleted model, you may call the `.restore()` method on a model instance.
Also, method `.restore()` exists after methods `.withTrashed()` and `.onlyTrashed()`
The `restore` method will set the model's `deleted_at` column to `null`:

```ts
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'

export default class TrashUsersController {
  /**
   * Update trashed user by id
   * PUT /trash/users/:id
   */
  async update({ params }: HttpContext) {
    const user = await User.withTrashed().where('id', params.id).firstOrFail()
    await user.restore()

    return user

    // or

    await User.withTrashed().where('id', params.id).restore()
    await User.query().withTrashed().where('id', params.id).restore()
  }
}
```

### Permanently Deleting Models

Sometimes you may need to truly remove a model from your database.
You may use the `.forceDelete()` method to permanently remove a soft deleted model from the database table:

```ts
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'

export default class UsersController {
  /**
   * Delete user by id
   * DELETE /users/:id
   */
  async destroy({ params, response }: HttpContext) {
    const user = await User.findOrFail(params.id)
    await user.forceDelete()

    return response.noContent()
  }
}
```

### Including Soft Deleted Models

As noted above, soft deleted models will automatically be excluded from query results.
However, you may force soft deleted models to be included in a query's results
by calling the `.withTrashed()` method on the model:

```ts
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'

export default class UsersController {
  /**
   * Get a list users
   * GET /users?withTrashed=1
   */
  async index({ request }: HttpContext) {
    const usersQuery = request.input('withTrashed') ? User.withTrashed() : User.query()

    return usersQuery.exec()

    // or

    return User.query()
      .if(request.input('withTrashed'), (query) => {
        query.withTrashed()
      })
      .exec()
  }
}
```

### Retrieving only Soft Deleted Models

The `.onlyTrashed()` method will retrieve **only** soft deleted models:

```ts
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'

export default class TrashUsersController {
  /**
   * Get a list trashed users
   * GET /trash/users
   */
  async index({ request }: HttpContext) {
    return User.onlyTrashed().exec()
  }
}
```

### Soft Deletes methods

Methods `.withTrashed()`, `.onlyTrashed()` and `.restore()` also available
in ModelQueryBuilder for models with soft delete, example:

```ts
await User.query().withTrashed().exec()
await User.query().onlyTrashed().restore()
```

## Scope contract

The default model query scope filters rows whose configured `deletedAt` column is not null.
`withTrashed()` disables that filter, while `onlyTrashed()` selects only rows with a deletion
timestamp. These modes are applied when Lucid executes a model fetch and are preserved when a
query is cloned or paginated.

| Operation                                                                                                          | 3.0.0 behavior                                                                                         | Test coverage                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `find*`, `first`, `exec`, `paginate`, and `all`                                                                    | Excludes soft-deleted rows by default                                                                  | `tests/unit/scope.spec.ts`: `groups a user OR expression before applying the default scope`; `tests/unit/model.spec.ts`: `querying models without trashed models`                                                                                                                                                                                                                             |
| `preload` and `load` for has-one, has-many, belongs-to, many-to-many, has-many-through, nested, and self relations | Scopes each fetched related model                                                                      | `tests/unit/scope_relations.spec.ts`: `filters has-one and has-many relations on preload, load, and related queries`; `filters belongs-to relations when preloading and loading`; `filters many-to-many relations on preload and related queries`; `filters has-many-through and nested relations at each loaded level`; `filters self-referential relations and nested belongs-to relations` |
| `user.related('posts').query()`                                                                                    | Applies the related model's default scope                                                              | `tests/unit/scope_relations.spec.ts`: `filters has-one and has-many relations on preload, load, and related queries`                                                                                                                                                                                                                                                                          |
| `withCount`, `withAggregate`, `has`, `whereHas`, `doesntHave`, `loadCount`, and `loadAggregate`                    | Bypass the soft-delete scope in alpha because relation subqueries do not run related-model fetch hooks | `tests/unit/scope_bypass.spec.ts`: `relation aggregates and existence checks include trashed children`                                                                                                                                                                                                                                                                                        |
| Relation aggregate `onQuery` callback                                                                              | Can explicitly scope a relation aggregate with `onQuery: (query) => query.whereNull('deleted_at')`     | `tests/unit/scope_bypass.spec.ts`: `a relation onQuery callback scopes withCount to active children`                                                                                                                                                                                                                                                                                          |
| `pojo()` queries                                                                                                   | Bypass the model scope                                                                                 | `tests/unit/scope_bypass.spec.ts`: `pojo queries return active and trashed records from exec, first, and paginate`                                                                                                                                                                                                                                                                            |
| Joins and embedded subqueries                                                                                      | Bypass the scope for joined models; only the query's model is scoped                                   | `tests/unit/scope_bypass.spec.ts`: `a join from a model without soft deletes does not filter the joined users`                                                                                                                                                                                                                                                                                |
| Bulk `update`, `delete`, `del`, and `increment`; `related().query().delete()`                                      | Bypass the scope; bulk `delete` and `del` are physical deletes                                         | `tests/unit/scope_bypass.spec.ts`: `bulk update and increment include trashed rows, while delete and del physically remove rows`; `related query delete and db.from operate without the model scope`                                                                                                                                                                                          |
| `db.from(...)` and raw queries                                                                                     | Bypass the model scope                                                                                 | `tests/unit/scope_bypass.spec.ts`: `related query delete and db.from operate without the model scope`                                                                                                                                                                                                                                                                                         |
| `refresh()` on a trashed instance                                                                                  | Loads the row by identity, including its `deletedAt` value                                             | `tests/unit/scope.spec.ts`: `refreshes an existing trashed instance by identity`                                                                                                                                                                                                                                                                                                              |
| OR predicates in default and only-trashed modes                                                                    | Groups user predicates before applying the scope; `withTrashed()` adds no scope predicate              | `tests/unit/scope.spec.ts`: `groups a user OR expression before applying the default scope`; `groups a user OR expression in only-trashed mode`; `with-trashed mode adds no filter and survives a clone`                                                                                                                                                                                      |
| Clones, pagination count queries, and preload callbacks                                                            | Preserve the selected mode                                                                             | `tests/unit/scope.spec.ts`: `with-trashed mode adds no filter and survives a clone`; `only-trashed mode survives a clone`; `pagination count inherits with-trashed mode`; `tests/unit/scope_relations.spec.ts`: `filters has-one and has-many relations on preload, load, and related queries`                                                                                                |
| Aliased base tables and self-joins                                                                                 | Qualifies the scope against the base alias or table                                                    | `tests/unit/scope.spec.ts`: `uses object and string aliases for the base table`; `qualifies the base table in a self join`                                                                                                                                                                                                                                                                    |

For a has-many-through relation, the related target is scoped, while the intermediate model is
joined without its own scope. An active comment can therefore be returned through a soft-deleted
post. Nested preloads fetch posts separately, so the deleted post and its nested comments are
excluded. Add an explicit qualified condition such as `whereNull('posts.deleted_at')` when the
intermediate row must be active. This behavior is covered by
`tests/unit/scope_relations.spec.ts`: `filters has-many-through and nested relations at each loaded level`.

## Contributing

Use Node.js 24 and pnpm 11. The default suite uses SQLite. To run it against PostgreSQL 16 on
macOS, start the local service and create the test database:

```bash
brew services start postgresql@16
createdb lucid_soft_deletes_test
pg_isready
DB_CLIENT=pg DB_USER="$USER" DB_DATABASE=lucid_soft_deletes_test pnpm test
```

Set `DB_HOST`, `DB_PORT`, or `DB_PASSWORD` as needed for a non-default local PostgreSQL setup.

[npm-image]: https://img.shields.io/npm/v/adonis-lucid-soft-deletes?logo=npm&style=for-the-badge
[npm-url]: https://www.npmjs.com/package/adonis-lucid-soft-deletes
[license-image]: https://img.shields.io/npm/l/adonis-lucid-soft-deletes?style=for-the-badge&color=blueviolet
[license-url]: https://github.com/lookinlab/adonis-lucid-soft-deletes/blob/develop/LICENSE.md
[typescript-image]: https://img.shields.io/npm/types/adonis-lucid-soft-deletes?color=294E80&label=%20&logo=typescript&style=for-the-badge
[typescript-url]: https://github.com/lookinlab
