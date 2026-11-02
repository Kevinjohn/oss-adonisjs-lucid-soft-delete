# Changelog

All notable changes to this project are documented here. This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.1.2-alpha - 2026-11-02

### Fixed

- Soft-delete filters, group limits, subqueries, lifecycle writes and receipt selectors quote a table alias containing a literal dot, such as `users as user.rows`, as one identifier. Schema-qualified table names still keep separate identifier segments.
- The cookbook's restore-after-unique-conflict recipe treats only the intended unique constraint as a conflict, rethrows other errors, and reports both the operation failure and the index-cleanup failure. The cookbook states that its delete-then-retry policy is not atomic.
- `pnpm docs:check` resolves selected Markdown files and link targets before reading them and reports any that point outside the checkout, including through symlinks.
- `pnpm check:changed` bounds subprocess cleanup and reports a process tree it could not fully stop, runs both of its own specs when runner or planner code changes, and accepts Japa summaries with todo and expected-failure tests.

### Changed

- Shorten the README to an overview, install steps, a quick example and links. The operation chooser and non-goals move to the [API reference](docs/api.md), and uniqueness and fixture guidance to the [cookbook](docs/cookbook.md).
- Dependabot groups weekly patch updates into one pull request and holds AdonisJS minor updates for 30 days after release.

## 0.1.1-alpha - 2026-10-27

First tagged prerelease. It contains every change listed under 0.1.0-alpha, which was not tagged or released.

### Added

- `pnpm format:check` runs `prettier --check` on tracked files only. `pnpm check:changed` and CI run it before lint, typecheck and tests.

## 0.1.0-alpha - 2026-10-27 (not released)

### Added

- Builder `softDelete()`, `restore()` and `forceDelete()` accept `{ receipt: true }` inside a caller transaction and return the changed primary keys, count and (for soft deletes) the written timestamp. Count-mode returns are unchanged.
- Builder `softDelete()` and `forceDelete()` return affected counts, preserve caller predicates and transaction clients, and provide explicit bulk lifecycle writes. `onlyTrashed().forceDelete()` purges only trashed rows. Many-to-many and has-many-through relation builders reject these macros and builder `restore()` before writing.

- Document serialisation, factory state, seeder uniqueness conflicts, PostgreSQL and SQLite partial indexes, MySQL generated-column guidance, restore conflicts, and cascade boundaries.
- Manual owner release checklist.
- A recycle-bin tutorial, a task-oriented cookbook, API and query-scope references, and a troubleshooting guide. Every source-marked example is maintained code in the installed-consumer fixture, and its tests run in the packed-consumer gate.
- `pnpm docs:check` validates local Markdown links, heading and source-line anchors, and source-backed code fences. CI and `pnpm check:changed` run it.

### Changed

- Rename the package to `@kevinjohn/lucid-soft-deletes` for AdonisJS 7, Lucid 22, and Node 24.
- Start at `0.1.0-alpha` and distribute it as a GitHub prerelease tarball; it is not published to npm.
- Replace the exception import for the current AdonisJS core export. Credit to necessarylion and abdulmatinsanni for identifying the compatibility fix.
- Refresh the test and build toolchain for the supported framework versions.
- Run the runtime suite on MySQL 8.4 as well as PostgreSQL 16 and SQLite in CI.
- Define the query scope contract for model reads, relations, aliases, clones, pagination, and documented bypass operations.
- Preserve soft-delete mode across cloned model and relation builders, and group user OR predicates before applying the default or only-trashed filter.
- Document that has-many-through scopes the related target but not its joined intermediate model; provide an explicit `onQuery` recipe for scoped relation counts.
- Make instance deletion lifecycle-safe: revert failed soft-delete timestamps, skip unchanged repeated deletes, support quiet soft deletion, and restore force-delete state after errors.
- Add trashed-only builder restore with grouped predicates, alias qualification, transaction support, and affected-row counts.
- Document lifecycle hooks, package migration guidance, and Lucid group-limit internals.
- Scope relationship aggregate and existence subqueries (`withCount`, `withAggregate`, `has`, `whereHas`, `doesntHave`, `loadCount`, `loadAggregate`) to active related rows. `withTrashed()` and `onlyTrashed()` inside the callback switch the mode.
- Preserve composed model fields and instance methods in emitted mixin types; retain relation-builder receiver types after soft-delete macros.
- Export a symbol-based soft-delete capability guard, the `SoftDeletesModel` type, and dedicated exception classes from the package root.
- Verify runtime behavior with a Lucid 22 generated-schema model.

### Fixed

- Receipt lifecycle writes reject has-many `groupLimit()` and `groupOrderBy()` before cloning, preserving the unsupported limit and ordering boundary.
- Reusing a has-many relation builder for a second default-mode `forceDelete()` no longer drops the relation constraint.
- Reject instance `restore()` when a fetched model did not load `deletedAt`.
- Reject instance `restore()` on an unpersisted model instead of inserting a new row.
- Preserve the existing soft-delete filter after subclass query hooks append OR predicates. Reusing a fetched builder for physical deletion now regroups later OR predicates before its retained filter too. An AND predicate appended by a hook, or added to a builder after it ran, applies to the caller's whole OR expression rather than its last alternative.
- Drop the filter from an earlier run when an executed builder switches to `withTrashed()`, so trashed rows are returned.
