# Lucid Soft Delete for AdonisJS

[![checks](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/actions/workflows/checks.yml/badge.svg?branch=main)](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/actions/workflows/checks.yml)
[![Node.js 24+](https://img.shields.io/badge/node-%3E%3D24-339933)](package.json)
[![AdonisJS 7](https://img.shields.io/badge/AdonisJS-7-5a45ff)](https://adonisjs.com)

> Pre-release. Installed from GitHub releases; not on npm.

## What you get

A soft-delete mixin for AdonisJS 7 Lucid models. Deleted rows stay in the database with a
`deleted_at` timestamp. Ordinary model queries hide them; use explicit methods to include,
restore or permanently remove them. Instance methods follow Lucid model lifecycle hooks, while
builder methods support bulk operations and optional transaction receipts.

Builder `delete()` and `del()` are physical deletes, even after `onlyTrashed()`. Use builder
`softDelete()` for recoverable bulk deletion and `forceDelete()` only when you intend to remove
rows permanently. See [the operation guide](docs/reference/README.md#choose-an-operation).

## Install

The command below installs `v0.4.0`, which exports the mixin as `SoftDeletes`. The examples in
this checkout use the unreleased `withSoftDeletes` name. Use the name from your installed version
in both the import and `compose()` call. See the [upgrade example](CHANGELOG.md#unreleased).

```sh
pnpm add https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/releases/download/v0.4.0/kevinjohn-adonisjs-lucid-soft-delete-0.4.0.tgz luxon
node ace configure @kevinjohn/adonisjs-lucid-soft-delete
```

`@adonisjs/assembler` `^8.0.0` is an optional peer used only by the configure command's codemods.
Configure adds `@kevinjohn/adonisjs-lucid-soft-delete/lucid_soft_delete_provider` to the providers
in `adonisrc.ts`. That provider installs the lifecycle methods on Lucid's model query builder.
The installed-consumer gate exercises configure twice and compiles the installed declarations with
TypeScript 5.9.3 and 6.0.3.

## Configure your models

The package is configured per model. Add a nullable `deleted_at` timestamp column to each
soft-deletable table, then compose the `withSoftDeletes` mixin into its model as shown below. The
[getting started guide](docs/guide/getting-started.md#add-the-column-to-an-existing-application) shows the migration.

## Quick example

Compose the mixin into a model:

```ts
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { withSoftDeletes } from '@kevinjohn/adonisjs-lucid-soft-delete'

export default class User extends compose(BaseModel, withSoftDeletes) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string

  @column()
  declare username: string
}
```

Delete, look in the recycle bin, restore:

<!-- source: examples/app/app/services/readme_example.ts#readme -->

```ts
import User from '#models/user'

export async function demonstrateRecovery(email: string) {
  const user = await User.create({ email, username: 'recycle-bin-demo' })
  await user.delete()
  const hidden = (await User.find(user.id)) === null

  const deleted = await User.onlyTrashed().where('id', user.id).firstOrFail()
  const inRecycleBin = deleted.trashed
  await deleted.restore()
  const visibleAgain = (await User.find(user.id)) !== null

  return { id: user.id, hidden, inRecycleBin, visibleAgain }
}
```

Calling `await demonstrateRecovery('alex@example.test')` with an unused email returns
`{ id: <created id>, hidden: true, inRecycleBin: true, visibleAgain: true }`. The row remains in the
database. The [getting started guide](docs/guide/getting-started.md) gives the full setup and also shows how to
purge a row deliberately.

## Documentation

- [Getting started](docs/guide/getting-started.md): add soft deletes to an application.
- [Recipes](docs/recipes/index.md): batch operations, transactions, counts and fixtures.
- [API reference](docs/reference/README.md): methods, return values, hooks, errors and types.
- [Scope contract](docs/reference/scope-contract.md): query paths and relationship behavior.
- [Troubleshooting](docs/guide/troubleshooting.md): common symptoms, causes and fixes.
- [Maintainer verification](docs/maintainers/verification.md): local test databases and checks.
- Apps moving from the previous package name or the original package: uninstall the previous package, change its imports to `@kevinjohn/adonisjs-lucid-soft-delete`, remove its provider entry from `adonisrc.ts`, then run `node ace configure @kevinjohn/adonisjs-lucid-soft-delete`. Models that still import the previous package are not recognised by this provider.

## Errors

Import `errors` from `@kevinjohn/adonisjs-lucid-soft-delete` and identify package exceptions by
their stable code constructors, such as `error instanceof errors.E_MODEL_NOT_PERSISTED`.
Each named class is also available in the namespace for instance type annotations.
See the [error reference](docs/reference/README.md#errors) for all exports.

## Supported versions

Requires Node.js 24+, AdonisJS 7, Lucid 22 and Luxon 3.4.4+ (3.x). TypeScript is an optional peer supported at `^5.9.3 || ^6.0.3`; install a supported version separately if your application uses TypeScript. The package's declarations expose Luxon's `DateTime` type, so TypeScript applications that do not already have Luxon declarations should install `@types/luxon`.

### Tested against

|                         | Every pull request | Weekly and on matching pull requests    |
| ----------------------- | ------------------ | --------------------------------------- |
| Node.js                 | 24                 | 24                                      |
| AdonisJS core           | locked version     | lowest supported (7.0.0) and latest 7.x |
| Lucid                   | locked version     | lowest supported and latest 22.x        |
| Assembler (configure)   | locked version     | lowest supported (8.0.0) and latest 8.x |
| SQLite (better-sqlite3) | yes                | —                                       |
| PostgreSQL 16           | yes                | yes, with the lowest and latest peers   |
| MySQL 8.4               | yes                | yes, with the locked peers              |

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and checks,
and [SECURITY.md](SECURITY.md) for vulnerability reports and the support window.

## License

[MIT](LICENSE.md). Originally created by Lookin Anton as
[adonis-lucid-soft-deletes](https://github.com/lookinlab/adonis-lucid-soft-deletes).

## User story catalogue

See the [source-reviewed user story catalogue](user-stories/README.md) for capability coverage and code-backed action flows, including demo journeys in this repository's local test fixtures.

For runnable applications, use the tested [Starter Examples apps](https://github.com/Kevinjohn/oss-adonisjs-starter-examples/tree/v0.17.0/apps).
