# @kevinjohn/lucid-soft-deletes

Give your AdonisJS application recoverable deletion. Deleted records stay in the database, ordinary model queries hide them, and explicit methods let you inspect, restore or permanently purge them. The package supplies the deletion mechanism; your application chooses who may delete, when to restore, and which records belong to the caller.

Supports AdonisJS 7, Lucid 22 and Luxon 3.4.4 or newer within 3.x, on Node.js 24 or newer. Use TypeScript 5.9 or newer.

**Documentation version:** the development candidate for `3.0.0-alpha.1`, including the reviewed lifecycle changes. A branch or merged PR is not an npm release. Use the README accompanying the exact version you install; the [source-checkout tutorial](docs/tutorial.md) works without assuming this candidate has been published. Version 3.0.0 is an alpha with intentional changes from 2.1.0; read the [migration guide](#migration-from-210) before upgrading.

## See the value

With the configured fixture `User` model (an `id`, `email`, `username` and nullable `deleted_at` column), the same record can disappear from normal reads and then return after restoration. This function is a service example, not model boot code:

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

## Choose your next step

- [Build a recycle bin](docs/tutorial.md): complete setup, migration, demo records, deletion, recovery and permanent purge, with expected results.
- [Solve a practical task](docs/cookbook.md): batches, tenant predicates, related records, counts, transactions, uniqueness and JSON timestamps.
- [Look up the API](docs/api.md): method results, state requirements, hooks, timestamps, errors and TypeScript contracts.
- [Understand query boundaries](docs/scope-contract.md): exactly which queries are scoped and the regression evidence behind the contract.
- [Troubleshoot a symptom](docs/troubleshooting.md): diagnostics and corrective examples for common integration and lifecycle problems.
- [Contribute or verify the package](CONTRIBUTING.md): supported toolchain, database checks and packed-consumer modes.

## Install

For a published compatible alpha, install the package and its required Luxon peer into an existing AdonisJS 7 application:

```bash
pnpm add @kevinjohn/lucid-soft-deletes@alpha luxon
node ace configure @kevinjohn/lucid-soft-deletes
```

`configure` registers `@kevinjohn/lucid-soft-deletes/provider` in `adonisrc.ts` once. Manual registration uses `() => import('@kevinjohn/lucid-soft-deletes/provider')` in its `providers` array. Add a nullable timestamp column before using the mixin; configuration does not generate or run your migration.

For an existing `users` table, the migration's `up()` adds `table.timestamp('deleted_at').nullable()` through `this.schema.alterTable('users', ...)`. Run `node ace migration:run` after creating the complete migration in the [tutorial](docs/tutorial.md#add-the-column-to-an-existing-application). That guide also explains fresh fixture setup and generated-schema composition.

## Choose an operation

| Your goal                                | Operation                                                   | What happens                                                          |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Delete one recoverable record with hooks | `await user.delete()`                                       | Saves a deletion timestamp; ordinary model reads hide the row.        |
| Soft-delete a selected batch             | `await User.query().whereIn('id', ids).softDelete()`        | Changes matching active rows without instance hooks; returns a count. |
| Inspect the recycle bin                  | `await User.onlyTrashed()`                                  | Returns deleted model rows.                                           |
| Restore selected deleted rows            | `await User.onlyTrashed().whereIn('id', ids).restore()`     | Clears matching deletion timestamps; returns a count.                 |
| Permanently purge selected deleted rows  | `await User.onlyTrashed().whereIn('id', ids).forceDelete()` | Physically deletes matching trashed rows; active rows remain.         |

**Destructive-operation warning:** builder `delete()` and `del()` are physical deletes. Read modes such as `onlyTrashed()` do not make those writes a safe purge. Use the explicit lifecycle methods, preserve your application predicates, and consult the [API reference](docs/api.md) before choosing between instance and bulk behavior. Soft deletion does not automatically cascade, enforce authorization, or erase retained personal data.

## Project lineage

This package continues [lookinlab/adonis-lucid-soft-deletes](https://github.com/lookinlab/adonis-lucid-soft-deletes) for AdonisJS 7 and Lucid 22. Upstream 2.1.0 targets AdonisJS 6 and Lucid 21. This continuation retains the upstream history and [MIT licence](LICENSE.md) while updating the integration and defining the scope and lifecycle behavior in tests.

<!-- TODO(owner): After posting docs/upstream-comment.md to upstream issue 32, add a sentence here linking to the posted comment. -->

## Scope contract

Normal model fetches hide rows with a deletion timestamp. The [scope contract](docs/scope-contract.md) describes which Lucid query paths apply that filter, how relation modes work, and which paths need explicit predicates.

## Destructive operations

The chooser above summarizes the common lifecycle paths and the physical builder-delete warning. The [API reference](docs/api.md#builder-lifecycle-methods) compares eligible rows, results, hooks, timestamps, errors, and transaction clients.

## Serialisation, factories, and seeders

`deletedAt` serializes as a date-time under its model property name by default; `serializeAs` can hide or rename the serialized field without changing persistence. The [API reference](docs/api.md#model-state) covers column mapping, projections, and `trashed` serialization. A Lucid factory can create trashed fixtures by setting `deletedAt = DateTime.local()` in a `state('trashed')` callback. A seeder using `updateOrCreate()` may try to insert when a matching row is trashed; fetch with `withTrashed()` and explicitly decide whether to restore or update it. See the [cookbook](docs/cookbook.md) for task-oriented examples.

## Uniqueness

Choose a database constraint based on whether a value can be reused after deletion. PostgreSQL and SQLite support a partial unique index that excludes trashed rows:

```sql
CREATE UNIQUE INDEX users_active_email_unique ON users (email)
WHERE deleted_at IS NULL;
```

MySQL has no partial unique indexes. A plain `(email, deleted_at)` unique index does **not** enforce uniqueness among active rows because multiple `NULL` values are distinct. Use a generated column holding the email only for active rows, then index it:

```sql
ALTER TABLE users
  ADD COLUMN active_email VARCHAR(255)
    GENERATED ALWAYS AS (IF(deleted_at IS NULL, email, NULL)) STORED,
  ADD UNIQUE KEY users_active_email_unique (active_email);
```

Match the generated column type and length to your email column. Application-side checks can race and do not replace a unique constraint. With an active-only index, restoring a trashed row whose email has since been reused fails with a database uniqueness error; the other row remains unchanged. Resolve the conflict before retrying `restore()` on the same trashed instance.

## Migration from 2.1.0

- Install `@kevinjohn/lucid-soft-deletes` and configure `@kevinjohn/lucid-soft-deletes/provider`.
- Upgrade to AdonisJS core 7, Lucid 22, and Node.js 24. Luxon 3.4.4 or newer within 3.x is a required peer.
- `trashed` is `false` when `deletedAt` is unset.
- OR conditions are grouped before the default or `onlyTrashed()` filter is applied. `onlyTrashed()` adds its predicate at execution time.
- `withTrashed()` and `onlyTrashed()` modes survive builder clones, pagination, and relation-builder clones. Base table aliases are supported.
- `refresh()` works on a trashed instance and loads `deletedAt`.
- Builder `restore()` affects trashed rows only, groups existing predicates, and returns the affected count.
- `deleteQuietly()` soft-deletes without running hooks.
- A failed `forceDelete()` resets `$forceDelete`; `$isDeleted` is set only after a physical delete resolves.
- Repeating `delete()` on an already-trashed instance skips the write when `deletedAt` is unchanged, even if other attributes are dirty. Calling `delete()` or `deleteQuietly()` on an unpersisted instance throws `E_MODEL_NOT_PERSISTED`.
- Dedicated exceptions identify unsupported models, force-deleted instances, unpersisted instances, and fetched models with unknown deletion state (`E_MODEL_UNKNOWN_DELETION_STATE`).
- The `ModelWithSoftDeletes` type augmented onto `@adonisjs/lucid/types/model` is removed. Import `SoftDeletesModel` from `@kevinjohn/lucid-soft-deletes` instead; it requires the `SOFT_DELETES` marker that the mixin sets, not the `ignoreDeleted` methods.
- Group-limited preload callbacks group OR predicates in the tested Lucid 22 release. See [docs/INTERNALS.md](docs/INTERNALS.md).
- Relationship aggregates and existence checks are scoped to active related rows. 2.1.0 counted trashed rows; use `withTrashed()` in the callback to keep that behaviour.
- No schema changes are required.

## Relationship aggregates

Relationship counts and existence checks scope soft-deletable related rows to active records by default. Select a different related mode inside that relation's callback. The [API reference](docs/api.md#relationship-aggregates-and-existence-queries) shows the methods; the [scope contract](docs/scope-contract.md#relationship-aggregates-and-existence-queries) records their boundaries and regression coverage.

## Non-goals

- No general global-scope framework; this mixin concerns `deleted_at` only.
- No cascade soft delete or restore. Child and pivot rows remain after a parent soft delete; `forceDelete()` follows the database's foreign-key and cascade rules.
- No migration generator beyond `configure` registering the provider.
- No AdonisJS 5 or 6 support. AdonisJS 6 users can stay on upstream 2.1.0.
- No `adonis-lucid-filter` compatibility promise while its available release targets older AdonisJS and Lucid peers.

## Support promise

This package supports the current AdonisJS major. When the next major ships, the previous line receives fixes for six months. Report bugs through [GitHub issues](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/issues) and security issues as described in [SECURITY.md](SECURITY.md). There is no response-time promise.

## TypeScript floor

Use TypeScript 5.9 or newer. TypeScript is not a package peer dependency.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the toolchain, the PostgreSQL, MySQL and
installed-package checks, and the pull request conventions. Security reports follow [SECURITY.md](SECURITY.md).

## Known internals

The scope relies on a few Lucid 22 internals: the `applyQueryFlags()` clone hook, the
`applyWhere()` sub-query hook, the `whereStack` rewrite, and group-limit subquery detection.
[docs/INTERNALS.md](docs/INTERNALS.md) names each one, where it lives in Lucid, and the tests that
cover it.
