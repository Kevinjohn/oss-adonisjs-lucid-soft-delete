# @kevinjohn/lucid-soft-deletes

This package continues [lookinlab/adonis-lucid-soft-deletes](https://github.com/lookinlab/adonis-lucid-soft-deletes) for AdonisJS 7 and Lucid 22. Upstream 2.1.0 targets AdonisJS 6 and Lucid 21. This continuation retains the upstream history and MIT license while updating the integration and defining the scope and lifecycle behavior in tests.

<!-- TODO(owner): After posting docs/upstream-comment.md to upstream issue 32, add a sentence here linking to the posted comment. -->

Version 3.0.0 is an alpha with intentional changes from 2.1.0. Read [Migration from 2.1.0](#migration-from-210) before upgrading.

## Install

Use Node.js 24 or newer with AdonisJS core 7, Lucid 22, and Luxon 3.4.4 or newer within 3.x. Install the alpha and its required Luxon peer:

```bash
pnpm add @kevinjohn/lucid-soft-deletes@alpha luxon
node ace configure @kevinjohn/lucid-soft-deletes
```

`configure` registers `@kevinjohn/lucid-soft-deletes/provider` in `adonisrc.ts`. For manual registration, add `() => import('@kevinjohn/lucid-soft-deletes/provider')` to its `providers` array once.

## Usage

Add a nullable timestamp to each table whose model uses the mixin. For an existing table:

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

Compose the model and use instance methods for soft and physical deletion:

```ts
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'

export default class User extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string
}

const user = await User.findOrFail(1)
await user.delete() // sets deleted_at; row remains

const trashedUser = await User.withTrashed().where('id', 1).firstOrFail()
console.log(trashedUser.trashed) // true
await trashedUser.restore()
await trashedUser.forceDelete() // physical DELETE
```

Read modes are available as model statics and builder macros. They survive cloning and pagination:

```ts
const active = await User.query().exec()
const all = await User.withTrashed().paginate(1)
const trashed = await User.query().onlyTrashed().exec()
const restoredCount = await User.query().onlyTrashed().where('email', 'a@example.test').restore()
```

For another database column, override the model mapping with `@column.dateTime({ columnName: 'removed_at' })` on `declare deletedAt: DateTime | null` and add that nullable column in your migration. `trashed` reads the loaded attribute; it is not a separate database column.

[examples/README.md](examples/README.md) has a complete migration, model, controller and route set using every method above.

## Scope contract

The default model query scope selects rows whose configured `deletedAt` column is null.
`withTrashed()` disables that filter, while `onlyTrashed()` selects only rows with a deletion
timestamp. These modes are applied when Lucid executes a model fetch and are preserved when a
query is cloned or paginated.

| Operation                                                                                                          | 3.0.0 behavior                                                                                                    | Test coverage                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `find*`, `first`, `exec`, `paginate`, and `all`                                                                    | Excludes soft-deleted rows by default                                                                             | `tests/unit/scope.spec.ts`: `groups a user OR expression before applying the default scope`; `tests/unit/model.spec.ts`: `querying models without trashed models`                                                                                                                                                                                                                             |
| `preload` and `load` for has-one, has-many, belongs-to, many-to-many, has-many-through, nested, and self relations | Scopes each fetched related model                                                                                 | `tests/unit/scope_relations.spec.ts`: `filters has-one and has-many relations on preload, load, and related queries`; `filters belongs-to relations when preloading and loading`; `filters many-to-many relations on preload and related queries`; `filters has-many-through and nested relations at each loaded level`; `filters self-referential relations and nested belongs-to relations` |
| `user.related('posts').query()`                                                                                    | Applies the related model's default scope                                                                         | `tests/unit/scope_relations.spec.ts`: `filters has-one and has-many relations on preload, load, and related queries`                                                                                                                                                                                                                                                                          |
| `withCount`, `withAggregate`, `has`, `whereHas`, `doesntHave`, `loadCount`, and `loadAggregate`                    | Scope the related model inside the subquery; `withTrashed()` or `onlyTrashed()` in the callback switches the mode | `tests/unit/scope_bypass.spec.ts`: `relation aggregates and existence checks exclude trashed children`; `withTrashed and onlyTrashed inside an aggregate callback switch the sub-query mode`; `tests/unit/scope_aggregates.spec.ts` for has-one, many-to-many, has-many-through, self-referential, and plain related models                                                                   |
| Relation aggregate `onQuery` callback                                                                              | Still applies; `onQuery: (query) => query.whereNull('deleted_at')` adds a second, redundant predicate             | `tests/unit/scope_bypass.spec.ts`: `a relation onQuery callback scopes withCount to active children`                                                                                                                                                                                                                                                                                          |
| `pojo()` queries                                                                                                   | Bypass the model scope                                                                                            | `tests/unit/scope_bypass.spec.ts`: `pojo queries return active and trashed records from exec, first, and paginate`                                                                                                                                                                                                                                                                            |
| Joins and embedded subqueries                                                                                      | Bypass the scope for joined models; only the query's model is scoped                                              | `tests/unit/scope_bypass.spec.ts`: `a join from a model without soft deletes does not filter the joined users`                                                                                                                                                                                                                                                                                |
| Bulk `update`, `delete`, `del`, and `increment`; `related().query().delete()`                                      | Bypass the scope; bulk `delete` and `del` are physical deletes                                                    | `tests/unit/scope_bypass.spec.ts`: `bulk update and increment include trashed rows, while delete and del physically remove rows`; `related query delete and db.from operate without the model scope`                                                                                                                                                                                          |
| `db.from(...)` and raw queries                                                                                     | Bypass the model scope                                                                                            | `tests/unit/scope_bypass.spec.ts`: `related query delete and db.from operate without the model scope`                                                                                                                                                                                                                                                                                         |
| `refresh()` on a trashed instance                                                                                  | Loads the row by identity, including its `deletedAt` value                                                        | `tests/unit/scope.spec.ts`: `refreshes an existing trashed instance by identity`                                                                                                                                                                                                                                                                                                              |
| OR predicates in default and only-trashed modes                                                                    | Groups user predicates before applying the scope; `withTrashed()` adds no scope predicate                         | `tests/unit/scope.spec.ts`: `groups a user OR expression before applying the default scope`; `groups a user OR expression in only-trashed mode`; `with-trashed mode adds no filter and survives a clone`                                                                                                                                                                                      |
| Clones, pagination count queries, and preload callbacks                                                            | Preserve the selected mode                                                                                        | `tests/unit/scope.spec.ts`: `with-trashed mode adds no filter and survives a clone`; `only-trashed mode survives a clone`; `pagination count inherits with-trashed mode`; `tests/unit/scope_relations.spec.ts`: `filters has-one and has-many relations on preload, load, and related queries`                                                                                                |
| Aliased base tables and self-joins                                                                                 | Qualifies the scope against the base alias or table                                                               | `tests/unit/scope.spec.ts`: `uses object and string aliases for the base table`; `qualifies the base table in a self join`                                                                                                                                                                                                                                                                    |
| Group-limited has-many and many-to-many preloads                                                                   | Apply the filter before each parent's limit                                                                       | `tests/unit/group_limit.spec.ts`: `scopes has-many rows before applying per-parent limits in each mode`; `scopes many-to-many rows before applying per-parent limits in each mode`                                                                                                                                                                                                            |
| Reusing a builder: awaiting the same query twice, `paginate()` then `first()`, or builder `restore()` twice        | Keeps the caller's predicates; the scope filter is replaced on each run, not stacked                              | `tests/unit/scope.spec.ts`: `keeps caller predicates when a builder executes more than once`; `tests/unit/builder_restore.spec.ts`: `keeps caller predicates when the same builder restores twice`                                                                                                                                                                                            |
| Subclass query hooks that append OR predicates                                                                     | Regroups appended predicates before the existing soft-delete filter                                               | `tests/unit/subclass_hooks.spec.ts`                                                                                                                                                                                                                                                                                                                                                           |

Subclass hooks that switch to `withTrashed()` after the mixin hook retain the filter already added. Hooks that call `clearWhere()` remove that filter along with caller predicates; append-only hook protection does not restore a removed scope.

For a has-many-through relation, the related target is scoped, while the intermediate model is
joined without its own scope. An active comment can therefore be returned through a soft-deleted
post. Nested preloads fetch posts separately, so the deleted post and its nested comments are
excluded. Add an explicit qualified condition such as `whereNull('posts.deleted_at')` when the
intermediate row must be active. This behavior is covered by
`tests/unit/scope_relations.spec.ts`: `filters has-many-through and nested relations at each loaded level`.

## Destructive operations

| Operation                    | Behavior                                                                                                                                | Result             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Instance `delete()`          | Sets `deletedAt` and saves the instance, including other dirty attributes. Repeated calls skip the write when `deletedAt` is unchanged. | `Promise<void>`    |
| Instance `deleteQuietly()`   | Soft-deletes through `saveQuietly()` without model hooks.                                                                               | `Promise<void>`    |
| Instance `forceDelete()`     | Physically deletes the row. The force-delete flag is reset after success or failure.                                                    | `Promise<void>`    |
| Instance `restore()`         | Requires a persisted instance. Clears `deletedAt`; an active instance is returned unchanged. A force-deleted instance throws `E_MODEL_FORCE_DELETED`.                  | `Promise<this>`    |
| Builder `delete()` / `del()` | Physically deletes matching rows, including active rows even after `onlyTrashed()` (see warning below).                                 | Lucid write result |
| Builder `restore()`          | Clears `deletedAt` only on matching trashed rows and returns the affected row count.                                                    | `Promise<number>`  |
| Builder `softDelete()`       | Sets the mapped timestamp on matching active rows only; `onlyTrashed()` returns zero.                                                   | `Promise<number>`  |
| Builder `forceDelete()`      | Physically deletes matching rows; `onlyTrashed()` preserves active rows.                                                                | `Promise<number>`  |

**Warning:** `withTrashed()` and `onlyTrashed()` are read modes. They are not applied to
builder `delete()`, `del()`, `update()` or `increment()`. For example, this physically
deletes both active and trashed matching rows:

```ts
await User.onlyTrashed().whereIn('id', [activeId, deletedId]).delete()
```

Use the explicit purge API to preserve matching active rows:

```ts
await User.onlyTrashed().whereIn('id', ids).forceDelete()
```

Builder `softDelete()` affects matching active rows in default and `withTrashed()` modes;
`onlyTrashed().softDelete()` returns zero. Builder `forceDelete()` affects matching trashed
rows in `onlyTrashed()` mode and all matching rows in default and `withTrashed()` modes.
Both return affected counts, preserve grouped caller predicates and use the query's client.
Neither runs instance hooks or changes `updatedAt`. For hooks and instance timestamp behavior,
fetch the selected models and call `await row.delete()` or `await row.forceDelete()` in a loop,
using the same transaction for the read and writes when needed.

Bulk `softDelete()` prepares its timestamp with Luxon's local time and the connection dialect's
date-time format, as Lucid does. Builder updates bypass custom column `prepare` functions;
this also applies when `deletedAt` has a UTC ISO serialiser (the serialiser still controls reads).
Many-to-many relation builders are rejected before writing because Lucid redirects their
writes to the pivot table. Query the related model directly with explicit IDs instead.

Soft deletion runs the normal update and delete hooks in this order:

```text
beforeDelete → beforeUpdate → beforeSave → write → afterUpdate → afterSave → afterDelete
```

`deleteQuietly()` skips hooks. Calls to `delete()` or `deleteQuietly()` on an unpersisted instance throw
`E_MODEL_NOT_PERSISTED`. See the [Scope contract](#scope-contract) for builder writes and operations
that bypass model fetch hooks. Transactions work through `useTransaction(trx)` and `query({ client: trx })`; builder `restore()` honors its query client. A soft-deleted parent retains child and pivot rows. A physical `forceDelete()` follows database foreign-key rules.

On an already-trashed instance, both `delete()` and `deleteQuietly()` skip the write when `deletedAt` is unchanged. Any other dirty attributes remain in memory; call `save()` or `saveQuietly()` to persist them.

If an `afterDelete` hook throws during `forceDelete()`, the physical DELETE may already have
completed. The instance remains marked deleted, and later delete or restore calls reject.

## Serialisation, factories, and seeders

`deletedAt` serializes as a date-time value by default. The undecorated `trashed` getter does not serialize. `serializeAs: null` hides the timestamp from serialized output without changing persistence or `trashed`. A renamed database column still serializes under the model property name unless `serializeAs` also changes:

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from '@kevinjohn/lucid-soft-deletes'
import type { DateTime } from 'luxon'

class User extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare id: number

  @column.dateTime({ columnName: 'removed_at', serializeAs: null })
  declare deletedAt: DateTime | null
}
```

If a `select()` omits `deletedAt`, the loaded instance reports `trashed === false`: the getter reflects loaded attributes, not database state. Include `deletedAt` when checking it on a projection. A Lucid factory can set `deletedAt = DateTime.local()` in a `state('trashed')` callback; the created row then appears through `withTrashed()`. A seeder using `updateOrCreate()` against a trashed row may attempt an insert. If a unique constraint still covers the trashed value, the database rejects it. Fetch with `withTrashed()` and explicitly decide whether to restore or update it. A soft delete inside a Lucid transaction rolls back with the transaction.

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
- Dedicated exceptions identify unsupported models, force-deleted instances, and unpersisted instances.
- The `ModelWithSoftDeletes` type augmented onto `@adonisjs/lucid/types/model` is removed. Import `SoftDeletesModel` from `@kevinjohn/lucid-soft-deletes` instead; it requires the `SOFT_DELETES` marker that the mixin sets, not the `ignoreDeleted` methods.
- Group-limited preload callbacks group OR predicates in the tested Lucid 22 release. See [docs/INTERNALS.md](docs/INTERNALS.md).
- Relationship aggregates and existence checks are scoped to active related rows. 2.1.0 counted trashed rows; use `withTrashed()` in the callback to keep that behaviour.
- No schema changes are required.

## Relationship aggregates

Lucid 22 does not run related-model fetch hooks for relationship aggregate and existence subqueries. The package scopes those subqueries itself: `withCount`, `withAggregate`, `has`, `whereHas`, `doesntHave`, `loadCount`, and `loadAggregate` count or match only active related rows when the related model uses the mixin. The parent model's own scope is unchanged. Switch the mode inside the callback:

```ts
const users = await User.query()
  .withCount('posts') // active posts
  .withCount('posts', (query) => query.withTrashed().as('all_posts'))
  .withCount('posts', (query) => query.onlyTrashed().as('trashed_posts'))
  .whereHas('posts', (query) => query.withTrashed().where('title', 'archived'))
```

Has-many-through scopes the target model, not the intermediate model, matching preload behaviour. A related model without the mixin is left alone. Self-referential relations qualify the filter with Lucid's self-join alias.

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
