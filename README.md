# @kevinjohn/lucid-soft-deletes

[![checks](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/actions/workflows/checks.yml/badge.svg)](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/actions/workflows/checks.yml)
[![release](https://img.shields.io/github/v/release/Kevinjohn/oss-adonisjs-lucid-soft-delete?include_prereleases&label=release)](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/releases)
[![node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![AdonisJS](https://img.shields.io/badge/AdonisJS-7-5A45FF?logo=adonisjs&logoColor=white)](https://adonisjs.com/)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE.md)

Soft deletes for AdonisJS 7 Lucid models. Deleted records stay in the database, ordinary model queries hide them, and explicit methods let you inspect, restore or permanently purge them.

- **Recover mistakes.** Instance `delete()` saves a deletion timestamp instead of removing the row; `restore()` brings it back.
- **Hidden by default.** Model fetches, relation queries and relationship counts skip trashed rows unless you ask for `withTrashed()` or `onlyTrashed()`.
- **Bulk operations.** Builder `softDelete()`, `restore()` and `forceDelete()` keep your predicates and transaction, and return a count, or a receipt of the changed ids with `{ receipt: true }` inside a transaction.

> [!WARNING]
> Builder `delete()` and `del()` delete rows physically, even after `onlyTrashed()`. Use builder `softDelete()` or `forceDelete()`; see [choose an operation](docs/api.md#choose-an-operation).

> [!NOTE]
> `0.1.1-alpha` is a [GitHub prerelease](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/releases/tag/v0.1.1-alpha) and is not published to npm yet. It continues [lookinlab/adonis-lucid-soft-deletes](https://github.com/lookinlab/adonis-lucid-soft-deletes) 2.1.0. Use the README accompanying the exact version you install.

## Install

Requires Node.js 24+, AdonisJS 7, Lucid 22, Luxon 3.4.4+ (3.x) and TypeScript 5.9+.

```bash
pnpm add https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/releases/download/v0.1.1-alpha/kevinjohn-lucid-soft-deletes-0.1.1-alpha.tgz luxon
node ace configure @kevinjohn/lucid-soft-deletes
```

Then add a nullable `deleted_at` timestamp column to each soft-deletable table. The [tutorial](docs/tutorial.md#add-the-column-to-an-existing-application) shows the migration.

## Quick example

Compose the mixin into a model:

```ts
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

Calling `await demonstrateRecovery('alex@example.test')` with an unused email returns `{ id: <created id>, hidden: true, inRecycleBin: true, visibleAgain: true }`. The restored row remains in the database. The [tutorial](docs/tutorial.md) supplies the complete setup and exercises this journey, including a separate deliberate physical purge.

The function returns `{ id, hidden: true, inRecycleBin: true, visibleAgain: true }`.

## Documentation

- [Tutorial](docs/tutorial.md): build a recycle bin from setup to permanent purge.
- [Cookbook](docs/cookbook.md): batches, transactions, related records, counts, uniqueness and fixtures.
- [API reference](docs/api.md): every method, its result, hooks, errors and TypeScript types.
- [Scope contract](docs/scope-contract.md): which queries hide trashed rows and which do not.
- [Troubleshooting](docs/troubleshooting.md): symptoms, causes and fixes.
- Apps moving from the original package: remove its provider entry from `adonisrc.ts`, then run `node ace configure @kevinjohn/lucid-soft-deletes`.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the toolchain and checks, and [SECURITY.md](SECURITY.md) for reporting vulnerabilities and the support window.

## Licence

[MIT](LICENSE.md). Originally created by Lookin Anton as [adonis-lucid-soft-deletes](https://github.com/lookinlab/adonis-lucid-soft-deletes).
