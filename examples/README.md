# Examples: soft-deleted users in an AdonisJS 7 app

Follow the complete [recycle-bin getting-started guide](../docs/guide/getting-started.md) to install the package from this
source checkout, configure a fixture app, migrate its database, and exercise create, hide, list,
restore, and permanent purge. It uses the installed-consumer app under `examples/app/`, which also
serves as the packed-package test fixture for `pnpm test:consumer`.

For an HTTP application, start with the [maintained native-authentication examples](starter/README.md),
especially the API fixture's administrator-only recycle bin. The standalone consumer above exercises
the library API, not an HTTP authorisation policy. The [API reference](../docs/reference/README.md)
describes the full lifecycle contract.

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
import { SoftDeletes } from '@kevinjohn/adonisjs-lucid-soft-delete'

export default class User extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string
}
```

The mixin declares `deletedAt` and the `trashed` getter. Add nothing else for the default column name.

## 3. Authorised administrator recycle bin

Use the complete [API starter fixture](starter/api/README.md) rather than mounting unauthenticated
lifecycle endpoints. Its [User model](starter/api/app/models/user.ts) combines native authentication
with `SoftDeletes`, and its [administrator migration](starter/api/database/migrations/1768620766696_add_soft_delete_admin_to_users.ts)
adds `is_soft_delete_admin`, defaulting to false. Only operators grant that flag to an existing
account; the [signup validator](starter/api/app/validators/user.ts) does not allow callers to grant it.

The [routes](starter/api/start/routes.ts) put both operations behind AdonisJS authentication.
The [controller](starter/api/app/controllers/deleted_users_controller.ts) checks the administrator
capability on every request, before querying the recycle bin. The [restore validator](starter/api/app/validators/deleted_user.ts)
requires a positive, safe integer route identifier, then the controller selects only trashed
accounts by that validated identifier. An active or missing account returns not found without writing.

The maintained files are the complete example, including authentication, administrator grants,
validation, account self-deletion, and the necessary framework configuration. Do not implement
public mutation endpoints merely by copying library method names into routes.

## What to expect

| Call                                           | Successful result                                              |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `DELETE /api/v1/account`                       | Authenticated account deletes itself; 204                      |
| `GET /api/v1/admin/deleted-users`              | Administrator sees projected id, email and deletion time       |
| `POST /api/v1/admin/deleted-users/:id/restore` | Administrator restores a trashed account; returns id and email |

Guests are unauthenticated, authenticated non-administrators are forbidden, invalid identifiers
fail validation, and missing or active identifiers return 404. The
[functional tests](starter/api/tests/functional/soft_delete.spec.ts) also prove token reactivation
after restoration and that public signup cannot grant administrator access. The Hypermedia and
Inertia fixtures use the same preconditions while preserving their browser redirects and flash
messages.

The fixtures project only the required fields and use Lucid `paginate(page, perPage)` with a
validated `page` query parameter (default 1), a fixed page size of 25, and descending deletion
time and ID ordering. The API returns the starter kit's paginated shape,
`serialize(Transformer.paginate(...))`: `{ data, metadata }` with Lucid's pagination metadata. Browser pages offer navigation and an empty-page state. The
administrator check and read filter apply on every page; restore remains independent of the
listing page.

Relations, pagination, transactions and the cases the read filter does not cover are in the
[scope contract](../docs/reference/scope-contract.md).

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

- The package owns deletion timestamps, lifecycle methods, soft-delete read filters, and use of the supplied client.
- The application owns tenant predicates, authorization, archive state, bookkeeping, and transaction boundaries.
- `withTrashed()` on a root query does not change related queries. Choose it separately for each preload or aggregate callback that needs deleted rows.
- These fictional fixture tables establish package behavior only. They do not establish an application's service integration, policies, or migration status.

## Application-owned recovery groups

The [group recovery recipe](../docs/recipes/index.md#recover-an-application-owned-deletion-group)
composes the existing count-returning mutation APIs into a one-use recovery lifecycle. The
maintained service, generic fixture migration and installed-consumer tests live in this example
app; group validity, tenant authorization, cleanup eligibility and the transaction boundary belong
to the application. It needs no package-owned undo framework.

The recipe keeps a fresh group identity and a current deletion association separately from the
soft-delete timestamp. This prevents an earlier group from restoring or purging a later deletion,
even if their deletion timestamps happen to be equal. Both installed-consumer commands above run
the same service functions shown in the recipe.
