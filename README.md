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

Requires Node.js 24+, AdonisJS 7, Lucid 22, Luxon 3.4.4+ (3.x) and TypeScript 5.9+.

```sh
pnpm add https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/releases/download/v0.1.2/kevinjohn-adonisjs-lucid-soft-delete-0.1.2.tgz luxon
node ace configure @kevinjohn/adonisjs-lucid-soft-delete
```

Then add a nullable `deleted_at` timestamp column to each soft-deletable table. The
[tutorial](docs/guide/getting-started.md#add-the-column-to-an-existing-application) shows the migration.

## Quick example

Compose the mixin into a model:

```ts
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from '@kevinjohn/adonisjs-lucid-soft-delete'

export default class User extends compose(BaseModel, SoftDeletes) {
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
database. The [tutorial](docs/guide/getting-started.md) gives the full setup and also shows how to
purge a row deliberately.

## Tested against

|                         | Every pull request | Weekly and before each release          |
| ----------------------- | ------------------ | --------------------------------------- |
| Node.js                 | 24                 | 24                                      |
| AdonisJS core           | locked version     | lowest supported (7.0.0) and latest 7.x |
| Lucid                   | locked version     | lowest supported and latest 22.x        |
| SQLite (better-sqlite3) | yes                | yes                                     |
| PostgreSQL 16           | yes                | yes                                     |
| MySQL 8.4               | yes                | yes                                     |

## Documentation

- [Getting started](docs/guide/getting-started.md): add soft deletes to an application.
- [Recipes](docs/recipes/index.md): batch operations, transactions, counts and fixtures.
- [API reference](docs/reference/README.md): methods, return values, hooks, errors and types.
- [Scope contract](docs/reference/scope-contract.md): query paths and relationship behavior.
- [Troubleshooting](docs/guide/troubleshooting.md): common symptoms, causes and fixes.
- [Maintainer verification](docs/maintainers/verification.md): local test databases and checks.
- Apps moving from the previous package name or the original package: uninstall the previous package, change its imports to `@kevinjohn/adonisjs-lucid-soft-delete`, remove its provider entry from `adonisrc.ts`, then run `node ace configure @kevinjohn/adonisjs-lucid-soft-delete`. Models that still import the previous package are not recognised by this provider.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and checks,
and [SECURITY.md](SECURITY.md) for vulnerability reports and the support window.

## License

[MIT](LICENSE.md). Originally created by Lookin Anton as
[adonis-lucid-soft-deletes](https://github.com/lookinlab/adonis-lucid-soft-deletes).
