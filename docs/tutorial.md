# Build a recycle bin with Lucid soft deletes

This walkthrough uses the repository's AdonisJS installed-consumer app. It builds the package
from the checkout, configures its provider, applies the SQLite migrations, then exercises a user
through create, hide, list, restore, and permanent purge. No published release is needed.

## Prerequisites and source checkout

Use Git, Node.js 24, pnpm 11, and a C/C++ toolchain supported by `better-sqlite3`. Work in a
disposable directory: the walkthrough writes an `.env` file and SQLite database under the checkout.
Run this block from that empty directory, using a checkout that contains this tutorial and the
lifecycle implementation it describes:

<!-- setup: tutorial -->

```sh
git clone https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete.git lucid-soft-delete
cd lucid-soft-delete
pnpm install --frozen-lockfile
pnpm build
pnpm --dir examples/app install
cp examples/app/.env.example examples/app/.env
pnpm --dir examples/app exec node ace generate:key
pnpm --dir examples/app exec node ace configure @kevinjohn/lucid-soft-deletes
pnpm --dir examples/app exec node ace migration:run
pnpm --dir examples/app exec node ace schema:generate
pnpm --dir examples/app typecheck
pnpm --dir examples/app test
```

The fixture depends on `file:../../`, so the app installs the package from this source checkout.
`configure` registers the package's public provider export in `examples/app/adonisrc.ts`. The fixture
already contains a generated `UserSchema` and a users-table migration with `deleted_at`; the migration
command creates the fixture tables, and `schema:generate` records the soft-delete column. The
companion test is registered in the fixture's consumer suite and can be run with the other fixture
tests as shown above.

## Add the column to an existing application

The fixture's initial users migration includes `deleted_at` so its clean setup is self-contained. In
an existing app whose `users` table does not yet have that column, generate a migration with the real
Ace command:

```sh
node ace make:migration add_deleted_at_to_users
```

In the generated file under `database/migrations/`, use this migration body, adjusting the class
name to the generated filename:

```ts
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

Then apply it with `node ace migration:run` and regenerate Lucid's model schema with
`node ace schema:generate`. The fixture setup above runs both commands against its included
migrations.

## Model and service

For a new application model, compose Lucid's `BaseModel` with the installed package's public
`SoftDeletes` export. The default mapping uses the nullable `deleted_at` migration column:

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

  @column()
  declare username: string
}
```

The fixture uses the equivalent generated `UserSchema` in `examples/app/app/models/user.ts`. Its
reusable service is the same code exercised by the companion test:

<!-- source: ../examples/app/app/services/recycle_bin.ts#tutorial -->

```ts
import User from '#models/user'

export function createUser(email: string, username: string) {
  return User.create({ email, username })
}

export function listActiveUsers() {
  return User.query().orderBy('id')
}

export function listRecycleBin() {
  return User.query().onlyTrashed().orderBy('deletedAt', 'desc')
}

export async function hideUser(id: number) {
  const user = await User.findOrFail(id)
  await user.delete()
}

export async function restoreUser(id: number) {
  const user = await User.withTrashed().where('id', id).firstOrFail()
  await user.restore()
}

export async function purgeUser(id: number) {
  const user = await User.onlyTrashed().where('id', id).firstOrFail()
  await user.forceDelete()
}
```

The `#models/user` alias resolves through the fixture's package imports. In an app, use that app's
model import alias or relative path. These functions show the lifecycle mechanics; they do not
implement application authorization. Put authentication and authorization at the route or service
boundary, and add the application's tenant predicate to each relevant read and write query. The
fixture has no tenant or authorization model, so it makes no policy claim.

## Observe the journey

Start the fixture REPL from the repository root:

```sh
pnpm --dir examples/app exec node ace repl
```

At the REPL prompt, use the functions from the service. Give the demo user a unique email if you
repeat the walkthrough:

```ts
const { createUser, listActiveUsers, listRecycleBin, hideUser, restoreUser, purgeUser } =
  await import('#services/recycle_bin')
const user = await createUser('ada-recycle-bin-1@example.test', 'ada')
user.id // A numeric database id; the user is present in listActiveUsers().
await hideUser(user.id)
await listActiveUsers() // The user is absent: delete() set deleted_at.
await listRecycleBin() // The user is present in the recycle bin.
await restoreUser(user.id)
await listActiveUsers() // The user is present again; deleted_at is null.
await hideUser(user.id)
// Confirm that this is the intended record and that permanent deletion is authorized.
await purgeUser(user.id)
await listRecycleBin() // The user is absent because forceDelete() removed the row.
```

`forceDelete()` issues a physical `DELETE`. In an application, expose this operation only behind an
explicit confirmation flow and the application's authorization and tenant checks. The test exercises
the confirmed call and verifies the row is gone; the fixture does not pretend to supply a
confirmation UI.

## Release boundary and further evidence

This tutorial targets the source checkout containing the lifecycle implementation. The fixture's
`file:../../` dependency and `pnpm build` make the example runnable before that implementation is
published. Consumers installing from a registry need a release that includes those lifecycle APIs;
do not infer registry availability from this source-checkout walkthrough.

The fixture establishes package behavior only. For installed-package checks, including the
latest-compatible and minimum-peer packed-consumer runs, see [the example guide](../examples/README.md).
Preserved transaction and lifecycle evidence, and its limitations, are also described there.
