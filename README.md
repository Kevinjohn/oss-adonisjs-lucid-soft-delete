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

For an existing `users` table, the migration's `up()` adds `table.timestamp('deleted_at').nullable()` through `this.schema.alterTable('users', ...)`. Run `node ace migration:run` after creating the complete migration in the [tutorial](docs/tutorial.md#add-the-column-and-model). That guide also explains fresh fixture setup and generated-schema composition.

## Choose an operation

| Your goal | Operation | What happens |
| --- | --- | --- |
| Delete one recoverable record with hooks | `await user.delete()` | Saves a deletion timestamp; ordinary model reads hide the row. |
| Soft-delete a selected batch | `await User.query().whereIn('id', ids).softDelete()` | Changes matching active rows without instance hooks; returns a count. |
| Inspect the recycle bin | `await User.onlyTrashed()` | Returns deleted model rows. |
| Restore selected deleted rows | `await User.onlyTrashed().whereIn('id', ids).restore()` | Clears matching deletion timestamps; returns a count. |
| Permanently purge selected deleted rows | `await User.onlyTrashed().whereIn('id', ids).forceDelete()` | Physically deletes matching trashed rows; active rows remain. |

**Destructive-operation warning:** builder `delete()` and `del()` are physical deletes. Read modes such as `onlyTrashed()` do not make those writes a safe purge. Use the explicit lifecycle methods, preserve your application predicates, and consult the [API reference](docs/api.md) before choosing between instance and bulk behavior. Soft deletion does not automatically cascade, enforce authorization, or erase retained personal data.

## Project lineage

This package continues [lookinlab/adonis-lucid-soft-deletes](https://github.com/lookinlab/adonis-lucid-soft-deletes) for AdonisJS 7 and Lucid 22. Upstream 2.1.0 targets AdonisJS 6 and Lucid 21. This continuation retains the upstream history and [MIT licence](LICENSE.md) while updating the integration and defining the scope and lifecycle behavior in tests.

<!-- TODO(owner): After posting docs/upstream-comment.md to upstream issue 32, add a sentence here linking to the posted comment. -->

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

| Operation                    | Eligible states                                                                                                | No-op / result                                                                     | Other dirty attributes                          | `updatedAt`                             | Hooks in order                                                                                       | Quiet behaviour            | Errors                                                                                                                    | Transaction / connection source                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Instance `delete()`          | Persisted active or trashed; physically deleted instances reject                                               | Unchanged trashed timestamp: no write; otherwise `Promise<void>`                   | Saved on a write; retained in memory on a no-op | Auto-updated on a write when configured | `beforeDelete` → `beforeUpdate` → `beforeSave` → write → `afterUpdate` → `afterSave` → `afterDelete` | Use `deleteQuietly()`      | Persistence and hook errors propagate                                                                                     | Instance client, `useTransaction(trx)` or client used to fetch it |
| Instance `deleteQuietly()`   | Same as instance `delete()`                                                                                    | Same no-op; `Promise<void>`                                                        | Same as instance `delete()`                     | Same as instance `delete()`             | None                                                                                                 | Uses `saveQuietly()`       | Persistence errors propagate                                                                                              | Instance client                                                   |
| Instance `restore()`         | Persisted, not physically deleted; fetched instances must include `deletedAt` (including loaded `null`)        | Active: returns unchanged instance; trashed: clears timestamp and returns instance | Saved on a write; retained on active no-op      | Auto-updated on a write when configured | `beforeUpdate` → `beforeSave` → write → `afterUpdate` → `afterSave`                                  | No quiet restore API       | `E_MODEL_NOT_PERSISTED`, `E_MODEL_FORCE_DELETED`, `E_MODEL_UNKNOWN_DELETION_STATE`, persistence and hook errors propagate | Instance client                                                   |
| Instance `forceDelete()`     | Persisted active or trashed; physically deleted instances reject                                               | Physical DELETE; `Promise<void>`; restores prior `$forceDelete` flag               | Not saved                                       | Unchanged                               | `beforeDelete` → write → `afterDelete`                                                               | No dedicated `forceDeleteQuietly()` method  | Persistence and hook errors propagate                                                                                     | Instance client                                                   |
| Builder `restore()`          | Matching trashed rows, regardless of read mode                                                                 | Clears timestamp; `Promise<number>` affected count, including zero                 | No model instances saved                        | Unchanged                               | None                                                                                                 | Always without model hooks | Query errors propagate                                                                                                    | Builder client / `useTransaction(trx)`                            |
| Builder `softDelete()`       | Matching active rows in default or `withTrashed()` mode; `onlyTrashed()` touches zero                          | Sets timestamp; `Promise<number>` affected count                                   | No model instances saved                        | Unchanged                               | None                                                                                                 | Always without model hooks | Query errors propagate; many-to-many relation builders reject                                                             | Builder client / `useTransaction(trx)`                            |
| Builder `forceDelete()`      | Matching active and trashed rows in default or `withTrashed()` mode; only trashed rows in `onlyTrashed()` mode | Physical DELETE; `Promise<number>` affected count                                  | No model instances saved                        | Unchanged                               | None                                                                                                 | Always without model hooks | Query errors propagate; many-to-many relation builders reject                                                             | Builder client / `useTransaction(trx)`                            |
| Builder `delete()` / `del()` | Matching active and trashed rows; read modes do not select rows for these writes                               | Physical DELETE; Lucid write result                                                | No model instances saved                        | Unchanged                               | None                                                                                                 | Always without model hooks | Query errors propagate                                                                                                    | Builder client / `useTransaction(trx)`                            |

Instance soft-delete and restore saves use Lucid's column `prepare` functions. Builder operations run directly against
mapped database columns, without instance column preparation, model hooks, or automatic timestamps.
Fetch the complete deletion state before restoring a projection; `await partial.refresh()` loads it
using the instance's client. Locally created and saved active instances may restore as a no-op.
Calls to instance `delete()`, `deleteQuietly()` or `restore()` on an unpersisted model reject with
`E_MODEL_NOT_PERSISTED`. A soft-deleted parent retains child and pivot rows; physical deletion follows
database foreign-key rules. See the [Scope contract](#scope-contract) for operations bypassing fetch hooks.

The package never opens its own transaction. Attach the caller's transaction using
`useTransaction(trx)` or fetch with `query({ client: trx })`; named connection clients are preserved.
Compose policy checks, mutations and application bookkeeping inside that same caller transaction.
After-hooks run before commit and are not proof of durable success. Dispatch external effects only
after the transaction resolves successfully; hooks do not provide an event bus or durability boundary.

An outer rollback restores database rows, but does not rewind model attributes or Lucid's tracking
state. After a soft delete or restore, `deletedAt`, `$original` and `$dirty` still reflect the completed
save: dirty attributes were saved and originals hydrated. Discard and refetch the instance, or refresh
a non-deleted instance before reusing it. After `forceDelete()` followed by rollback, the row exists
again but the instance remains `$isDeleted`; `refresh()` rejects, so discard and refetch it.
`$forceDelete` is restored to its prior value even on failure. An after-hook error can follow a
successful SQL write; without a caller transaction, that write may already be durable.

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
- Dedicated exceptions identify unsupported models, force-deleted instances, unpersisted instances, and fetched models with unknown deletion state (`E_MODEL_UNKNOWN_DELETION_STATE`).
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
