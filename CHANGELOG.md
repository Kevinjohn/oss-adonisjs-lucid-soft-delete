# Changelog

All notable changes to this project are documented here. This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- `pnpm format:check` runs `prettier --check` on tracked files only. `pnpm check:changed` and CI run it before lint, typecheck and tests.

## 0.1.0-alpha - 2026-10-27

### Added

- Builder `softDelete()` and `forceDelete()` return affected counts, preserve caller predicates and transaction clients, and provide explicit bulk lifecycle writes. `onlyTrashed().forceDelete()` purges only trashed rows. Many-to-many and has-many-through relation builders reject these macros and builder `restore()` before writing.

- Document serialisation, factory state, seeder uniqueness conflicts, PostgreSQL and SQLite partial indexes, MySQL generated-column guidance, restore conflicts, and cascade boundaries.
- Manual owner release checklist and a draft upstream status comment.
- A recycle-bin tutorial, a task-oriented cookbook, API and query-scope references, and a troubleshooting guide. Every source-marked example is maintained code in the installed-consumer fixture, and its tests run in the packed-consumer gate.
- `pnpm docs:check` validates local Markdown links, heading and source-line anchors, and source-backed code fences. CI and `pnpm check:changed` run it.

### Changed

- Continue from upstream `adonis-lucid-soft-deletes` tag `v2.1.0` (`71d21fb5f16f47e9c77386e58b47ca428d04c050`) and master (`83c08d6be8828bf0d7e97a4ac91d9458f4177d2a`). The complete upstream history is retained.
- Rename the package to `@kevinjohn/lucid-soft-deletes` for AdonisJS 7, Lucid 22, and Node 24.
- Number the continuation from `0.1.0-alpha` and distribute it as a GitHub prerelease tarball; it is not published to npm.
- Replace the exception import for the current AdonisJS core export. Credit to necessarylion ([upstream PR 33](https://github.com/lookinlab/adonis-lucid-soft-deletes/pull/33)) and abdulmatinsanni ([upstream PR 34](https://github.com/lookinlab/adonis-lucid-soft-deletes/pull/34)) for identifying the compatibility fix.
- Refresh the test and build toolchain for the supported framework versions.
- Run the runtime suite on MySQL 8.4 as well as PostgreSQL 16 and SQLite in CI.
- Define the query scope contract for model reads, relations, aliases, clones, pagination, and documented bypass operations.
- Preserve soft-delete mode across cloned model and relation builders, and group user OR predicates before applying the default or only-trashed filter.
- Document that has-many-through scopes the related target but not its joined intermediate model; provide an explicit `onQuery` recipe for scoped relation counts.
- Make instance deletion lifecycle-safe: revert failed soft-delete timestamps, skip unchanged repeated deletes, support quiet soft deletion, and restore force-delete state after errors.
- Add trashed-only builder restore with grouped predicates, alias qualification, transaction support, and affected-row counts.
- Document lifecycle hooks, migration changes from 2.1.0, and Lucid group-limit internals.
- Scope relationship aggregate and existence subqueries (`withCount`, `withAggregate`, `has`, `whereHas`, `doesntHave`, `loadCount`, `loadAggregate`) to active related rows. `withTrashed()` and `onlyTrashed()` inside the callback switch the mode. 2.1.0 counted trashed rows.
- Preserve composed model fields and instance methods in emitted mixin types; retain relation-builder receiver types after soft-delete macros.
- Export a symbol-based soft-delete capability guard and dedicated exception classes from the package root. `SoftDeletesModel` replaces the `ModelWithSoftDeletes` type that 2.1.0 augmented onto `@adonisjs/lucid/types/model`.
- Verify runtime behavior with a Lucid 22 generated-schema model.

### Fixed

- Reject instance `restore()` when a fetched model did not load `deletedAt`.
- Reject instance `restore()` on an unpersisted model instead of inserting a new row.
- Preserve the existing soft-delete filter after subclass query hooks append OR predicates. Reusing a fetched builder for physical deletion now regroups later OR predicates before its retained filter too. An AND predicate appended by a hook, or added to a builder after it ran, applies to the caller's whole OR expression rather than its last alternative.
- Drop the filter from an earlier run when an executed builder switches to `withTrashed()`, so trashed rows are returned.
