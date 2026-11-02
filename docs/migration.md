# Migrating from upstream 2.1.0

`@kevinjohn/lucid-soft-deletes` continues [lookinlab/adonis-lucid-soft-deletes](https://github.com/lookinlab/adonis-lucid-soft-deletes) 2.1.0, which targets AdonisJS 6 and Lucid 21. AdonisJS 6 users can stay on upstream 2.1.0. These are the intentional changes for AdonisJS 7:

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
- Group-limited preload callbacks group OR predicates in the tested Lucid 22 release. See [INTERNALS.md](INTERNALS.md).
- Relationship aggregates and existence checks are scoped to active related rows. 2.1.0 counted trashed rows; use `withTrashed()` in the callback to keep that behaviour.
- No schema changes are required.
