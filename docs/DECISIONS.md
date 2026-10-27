# Decision log

This log records implementation decisions made while delivering version 0.1.0-alpha. The PRD defines the product contract; an entry here records how that contract was carried out or why evidence required a change.

## 2026-10-25: Preserve upstream history with a merge commit

- **Decision:** Import `lookinlab/adonis-lucid-soft-deletes` master at `83c08d6` with an unrelated-history merge commit, retaining its full ancestry and licence text.
- **Reason:** The PRD requires provenance in Git history and both copyright notices in the distributed licence.
- **Evidence:** WP0 ancestry, commit-count, licence, and ignore checks.

## 2026-10-25: Retain the existing private-plan ignore rule

- **Decision:** Carry the checkout's pre-existing `__*.md` ignore edit into the merged `.gitignore`, along with both repositories' other ignore rules.
- **Reason:** The PRD and the checkout both require private planning files to remain uncommitted.
- **Evidence:** WP0 ignore check and `git status` after the merge.

## 2026-10-25: Name Lucid's inherited hooks type during the WP1 toolchain migration

- **Decision:** Declare the mixin class's static `$hooks` using the public `LucidModel['$hooks']` type.
- **Reason:** TypeScript 5.9 could not emit a portable declaration for the inferred class type because it named an internal pnpm path for Lucid's hooks dependency. The declaration adds no runtime field and leaves the broader mixin type redesign for WP5.
- **Evidence:** The WP1 typecheck initially failed with TS2742 at `src/mixin.ts:24`; a focused declaration-emission check passed after this annotation.

## 2026-10-25: Make WP1 fixtures run on both CI database legs

- **Decision:** Read `DB_CLIENT` in the shared test helper during WP1 and configure both SQLite and PostgreSQL connections, while keeping each test's temporary SQLite database and table lifecycle.
- **Reason:** The WP1 CI matrix already runs tests on both databases. A SQLite-only helper would make the PostgreSQL leg appear green without exercising PostgreSQL.
- **Evidence:** The 17 retained tests pass under both `pnpm test` and `DB_CLIENT=pg pnpm test` on Node 24. PostgreSQL-specific boolean and foreign-key cleanup differences were corrected in the fixtures.

## 2026-10-25: Build before the WP2 runtime suite

- **Decision:** Run `pnpm build` from the `pretest` script once emitted-declaration tests are part of the runtime suite.
- **Reason:** The WP2 test reads `build/*.d.ts`, while the package must pass `pnpm test` from a clean clone. Building first also prevents a stale declaration from producing a false pass. `pnpm build` already runs lint through `precompile`.
- **Evidence:** The declaration test failed against the WP1 build, then passed after the root import change. After deleting `build`, `pnpm test` rebuilt it and passed 21/21 tests on SQLite; the same full suite passed on PostgreSQL.

## 2026-10-25: Remove legacy provider entries from nested syntax trees in reverse order

- **Decision:** In `configure`, inspect array literals from the deepest descendant back to the outermost when removing the legacy provider entry.
- **Reason:** A provider object with an `environment` array invalidates the inner syntax-tree node when the outer provider element is removed first.
- **Evidence:** The real temporary-app configure test failed on the object form before the ordering change and passes for fresh, arrow-import, and object forms after it.

## 2026-10-25: Use pnpm 11's default unfrozen behavior for peer updates

- **Decision:** Omit `--no-frozen-lockfile` from CI's `pnpm add` and `pnpm update` commands.
- **Reason:** pnpm 11.23.0 rejects that flag for these commands; its default behavior permits the intended temporary peer changes.
- **Evidence:** Separate disposable checkouts passed `pnpm test` (17/17) and `pnpm build` on PostgreSQL 16 with core 7.0.0/Lucid 22.0.0 and with core 7.6.0/Lucid 22.4.2 after the flag was removed.

## 2026-10-25: Apply read scope at fetch time and carry the mode through clones

- **Decision:** Store `default`, `with`, or `only` mode on model query builders, copy it through Lucid's guarded `applyQueryFlags` clone path, and add the filter from the model fetch and pagination hooks. Group existing predicates before adding the filter.
- **Reason:** Applying the predicate in a query hook makes the scope part of the executed fetch, while preserving the mode lets clones, relation builders, and pagination count queries keep the caller's intent.
- **Evidence:** WP3 scope tests cover OR grouping, aliases, clones, pagination, relation loads, and the query-builder bypass rows in the scope contract table in README.

## 2026-10-25: Scope the has-many-through target and characterize its intermediate join

- **Decision:** Apply the default scope to the related target model in has-many-through queries, without implicitly filtering the joined intermediate model.
- **Reason:** Lucid executes fetch hooks for the relation query's target model; joined models do not independently run their model hooks. The PRD excludes automatic scoping for joins and requires the related target to be scoped.
- **Evidence:** The has-many-through test shows an active related comment remains visible through a deleted post, while nested preload scopes the posts and their separately fetched comments. README documents an explicit qualified condition for callers who require an active intermediate row.

## 2026-10-25: Keep instance delete semantics separate from bulk writes

- **Decision:** Instance `delete()` and `deleteQuietly()` soft-delete through model saves; builder `delete()` and `del()` remain physical bulk deletes. Instance restore is a no-op for active rows, while builder restore changes only trashed rows and returns the affected count.
- **Reason:** Lucid model hooks and timestamps apply to instance saves. Bulk writes bypass those hooks by design, and their existing physical-delete behavior is retained.
- **Evidence:** WP4 lifecycle and builder-restore tests exercise hook order, dirty attributes, failure recovery, grouped predicates, transaction clients, and physical builder deletes.

## 2026-10-25: Reset force-delete state across success and failure

- **Decision:** Restore the prior `$forceDelete` value in `finally`, preserve Lucid's deleted-instance guard before soft-delete no-op handling, and set `$isDeleted` only when Lucid's physical deletion resolves.
- **Reason:** Reusing an instance after a failed delete must not silently switch its next `delete()` into a physical delete. A failure from an `afterDelete` hook occurs after the row is already gone and retains Lucid's deleted-instance state.
- **Evidence:** WP4 lifecycle tests cover before-hook failure, database foreign-key failure, and after-hook failure.

## 2026-10-25: Preserve modes across Lucid's group-limit outer query

- **Decision:** Keep Lucid's group-limit query path and carry the selected soft-delete mode on its inner Knex builder. Resolve the inner table alias when qualifying the filter. Record that the OR leak described in the initial plan does not reproduce on Lucid 22.4.2.
- **Reason:** Lucid creates a fresh outer model builder for grouped execution. Without mode propagation, its fetch hook applies the default predicate to the inner query even when the relation callback selected `withTrashed()` or `onlyTrashed()`. The tested SQL groups callback OR conditions before the relation key and soft-delete predicate.
- **Evidence:** WP4 group-limit tests cover exact identities for has-many and many-to-many results on SQLite and PostgreSQL in each mode, and characterize OR grouping. The source touchpoints are Lucid's `orm/relations/has_many/query_builder.js` and `orm/relations/many_to_many/query_builder.js`.

## 2026-10-25: Recover deletion state according to whether Lucid persisted the write

- **Decision:** Detect whether Lucid replaced the model's `$original` object during `save()` to distinguish a pre-write failure from a hook failure after the database update. Restore the previous in-memory timestamp only when the write was not hydrated. Keep this helper lexical to the mixin module so subclasses cannot override it. Apply it to soft deletion, quiet deletion and restore.
- **Reason:** Lucid replaces `$original` after the update and before `afterUpdate` and `afterSave` hooks. Comparing timestamps is insufficient because a before hook may change `deletedAt`. Reverting after a post-write hook failure would make the instance disagree with its persisted row; leaving a failed pre-write restore cleared would prevent retry on the same instance.
- **Evidence:** Lifecycle regressions for pre-write restore failure, post-write delete/restore failure, and a hook-adjusted timestamp failed on the earlier WP4 implementation and pass on SQLite and PostgreSQL 16. The installed Lucid save sequence is `build/src/orm/base_model/index.js:1357-1358,1553-1559`.

## 2026-10-25: Export named interfaces for the soft-delete mixin

- **Decision:** Give `SoftDeletes` an explicit constructor return type built from exported `SoftDeletesStatics` and `SoftDeletesInstance` interfaces, while preserving the input constructor's static surface and instance type. Keep `restore()` as `Promise<this>`.
- **Reason:** TypeScript's inferred anonymous mixin class emitted constraints that failed in a packed consumer and widened instance methods such as `restore()` and `useTransaction()`. Named interfaces provide stable declarations and retain fields from custom base models and mixin composition order.
- **Evidence:** WP5 compile-time contracts cover subclass fields, static and builder result types, transactions, preload relations, custom bases, and both mixin orders; packed-consumer acceptance is recorded in the WP1 findings after verification.

## 2026-10-25: Preserve builder receiver types and gate macros on capability

- **Decision:** Declare query-builder macros with polymorphic `this` return types and require the explicit `SOFT_DELETES` symbol marker for method calls. Augment Lucid's concrete builder with the same methods, using a receiver that requires a proven soft-delete model. Use `hasSoftDeletes` in runtime macro validation.
- **Reason:** Macro chains must preserve relation-specific methods such as `groupLimit`, while plain models must not be able to call soft-delete macros. Lucid's concrete builder implements the augmented contract, so its declaration must also include the macro methods for `skipLibCheck: false`; the gated receiver prevents an unproven concrete builder from calling them. A `deletedAt` column alone is not a reliable capability signal.
- **Evidence:** WP5 type assertions cover relation-builder chains and reject `withTrashed()` on a plain model or an unproven concrete builder. Guard tests distinguish the mixin marker from a hand-written `deletedAt` column. The packed consumer type-checks with `skipLibCheck: false`.

## 2026-10-25: Keep the generated schema's required deletedAt property

- **Decision:** Retain the optional `deletedAt` declaration on the mixin instance and compose it with the generated-schema fixture's required `deletedAt: DateTime | null` property.
- **Reason:** TypeScript accepts the intersection for the schema shape exercised by Lucid 22, so changing the public mixin field to required would be unnecessary and would misrepresent fresh instances whose attribute may be unset.
- **Evidence:** The WP5 schema runtime test type-checks and exercises find, delete, and restore on SQLite and PostgreSQL.

## 2026-10-25: Exercise the package in an isolated AdonisJS application

- **Decision:** Commit a slim AdonisJS 7 fixture under `examples/app` with its own pnpm workspace and lockfile, then copy it into a temporary directory for each packed-package run. The fixture imports its generated `UserSchema`, and the gate regenerates that schema before typechecking.
- **Reason:** A nested workspace keeps the fixture dependency graph independent of the package under test. Installing the tarball into a fresh copy proves that the app resolves the distributed package rather than source files in this checkout.
- **Evidence:** The fixture's strict TypeScript check, build, configure twice, schema generation, migration and Japa consumer test pass locally. The packed latest and minimum peer runs pass on both SQLite and PostgreSQL 16.

## 2026-10-25: Keep strict fixture typechecking across upstream declaration gaps

- **Decision:** Pin the fixture to TypeScript 5.9.3 and Node types 25.9.9, include the optional peer declarations imported by Adonis, and load Ace command modules through dynamic module IDs. Retain `skipLibCheck: false`.
- **Reason:** Node 26 types change tracing declarations, while generated core and Lucid command indexes import a `Command` type absent from the installed Ace declarations. Ace's configuration contract already accepts dynamic command loaders, which preserve runtime command registration without depending on those generated command-index types.
- **Evidence:** The fixture's strict typecheck and runtime configure, schema, migration, build and consumer test pass with these dependencies and loaders.

## 2026-10-25: Remove an unused starter entity-indexing hook from the consumer fixture

- **Decision:** Omit the slim starter's `indexEntities()` initialization hook from the committed consumer fixture.
- **Reason:** The fixture does not import generated controller, event or listener barrels. The hook's types conflict with core 7.0.0 and the installed assembler, while Lucid's `schema:generate` command is independent of it.
- **Evidence:** The first minimum-peer run reached strict typechecking and reported only the hook mismatch. After removing it, both exact minimum and latest packed consumer runs pass configure, schema generation, migration, strict typechecking, build and Japa on SQLite and PostgreSQL. The declared peer floor remains core 7.0.0 and Lucid 22.0.0.

## 2026-10-25: Prove configuration and peer selection from a fresh consumer state

- **Decision:** Commit the fixture without the package provider, require provider counts of zero, one and one across two `configure` runs, and discard only the temporary app's lockfile in latest-peer mode. Keep exact TypeScript 5.9.3 and Node types 25.9.9 versions in the fixture manifest.
- **Reason:** A pre-registered provider lets a no-op configuration hook pass. A copied lockfile can keep the latest-peer mode on old framework versions; resolving its compatible major ranges afresh tests the current peers while retaining a stable compiler baseline.
- **Evidence:** The packed gate asserts each provider count and logs the installed dependency versions. Minimum mode still installs exact core 7.0.0 and Lucid 22.0.0.

## 2026-10-25: Isolate PostgreSQL consumer runs by schema

- **Decision:** Create a unique temporary PostgreSQL schema for each packed consumer run, pass it through the fixture's Lucid `searchPath` configuration, and drop it after the run.
- **Reason:** The app's migrations otherwise leave `users` and migration metadata in the shared test database. A later run may skip its migration and pass against an earlier run's table.
- **Evidence:** The gate checks the app connection's selected schema before Ace runs, confirms the migration created `users` there, then removes the schema on success and failure. Lucid's `schema_generate.js:60-73` reads the connection's `searchPath` for table discovery; without that setting it scans `public` even when the session has another search path. On a clean database, both latest and exact minimum modes scan zero tables before migration and one `users` table afterward, generate `deletedAt`, and leave no public or temporary schema tables. The root PostgreSQL suite passes after these runs.

## 2026-10-25: Test persistence boundaries with database constraints

- **Decision:** Characterize factory and seeder behavior through real unique constraints, test active-only uniqueness and restore conflicts on PostgreSQL, and exercise parent relations and physical-delete foreign-key behavior on both database dialects.
- **Reason:** Soft-delete query filtering does not alter uniqueness or foreign-key enforcement. A rejected restore must leave the newer active row unchanged, and deleting a parent must follow the database's configured cascade rule.
- **Evidence:** WP7 adds serialization, factory/seeder, PostgreSQL partial-index and cascade tests. A restore-conflict regression also verifies retry on the same instance after the collision is resolved. The integrated suite passes 100 tests with two PostgreSQL-only cases skipped on SQLite, and 102 tests on PostgreSQL 16. Focused mutation checks failed at the intended assertions before restoration.

## 2026-10-25: Keep publication and upstream communication as owner steps

- **Decision:** Document manual alpha publication and prepare an upstream issue-32 comment as a draft. Leave the changelog release date for the owner and retain the README comment placeholder until the upstream comment is posted.
- **Reason:** The PRD reserves package publication, tagging and the upstream communication to the owner after the release checks and merges.
- **Evidence:** `docs/RELEASING.md` lists the manual checks and commands; `docs/upstream-comment.md` is an unposted draft. The packed tarball contains the licence, README, changelog and build output, with no tests or examples.

## 2026-10-25: Follow the specified CI legs and run the full peer/database combination locally

- **Decision:** Keep the WP1 and WP6 CI jobs as specified: the root suite on both databases, peer-update jobs on PostgreSQL, the latest packed consumer on SQLite, and the minimum packed consumer on PostgreSQL. Verify the other packed consumer combinations locally.
- **Reason:** The PRD's work-package commands define these CI legs, while its broader acceptance language asks for evidence on both databases and peer modes. The local cross-product closes that evidence gap without adding unrequested CI jobs.
- **Evidence:** Latest and exact minimum packed consumers pass on both SQLite and PostgreSQL 16; a disposable exact-minimum checkout passes the root PostgreSQL suite and minimum packed consumer gate. GitHub Actions jobs remain unable to start because of the account billing restriction.

## 2026-10-25: Require passing CI before merging the work-package stack

- **Decision:** Hold WP1–WP7 merges until the required GitHub Actions checks run and pass. Local verification supports the implementation but does not replace the merge gate.
- **Reason:** The repository owner chose to wait for CI after the runner jobs failed before starting.
- **Evidence:** PRs #2–#8 remain open. The check annotations report an account payment or spending-limit restriction; the complete local suites and packed consumer modes passed.

## 2026-10-26: Keep releases manual; add no release workflow

- **Decision:** Align CI with the sibling AdonisJS packages (`checks.yml` job guard, conditional PostgreSQL service, `workflow_call` trigger, `codeql.yml`, `scorecard.yml`, `dependabot.yml`) but do not add their `release.yml`.
- **Reason:** This package publishes to the `alpha` dist-tag by hand following `docs/RELEASING.md`. A release workflow would need publish credentials and a tag trigger that the alpha process does not define yet.
- **Evidence:** `docs/RELEASING.md` states that publishing and tagging are manual owner actions. The sibling `release.yml` files call `checks.yml` through `workflow_call`, which this change adds so a later release workflow can reuse the checks unchanged.

## 2026-10-26: Scope relation sub-queries by wrapping `applyWhere()`

- **Decision:** Add a second Lucid prototype hook. `installSubQueryScope()` wraps `ModelQueryBuilder.prototype.applyWhere()` and, for a relation sub-query builder (`isRelatedSubQuery === true`, not a `where` callback child) whose model has the mixin, calls `applySubQueryScope()` before flushing the where stack.
- **Reason:** Lucid's relation sub-query classes (`BaseSubQueryBuilder` and the five relation builders) are not exported, and `prepare()` lives on that unexported base class, so it cannot be wrapped directly. Every rendering path (`select(subQuery.prepare())` and `whereExists(subQuery.prepare())` through `toKnex()`, `has` with an operator through `toSQL()`, `loadCount` and `loadAggregate` through `withAggregate`) flushes `whereStack` with `applyWhere()` after `prepare()` has added the relation constraint, so that method sees the final mode and the constrained builder for all five relation types. The group-limit detection in `applyScope()` reads SQL from a clone, which would re-enter the same hook, so `applySubQueryScope()` skips it; relation sub-queries have no group-limit path.
- **Evidence:** `tests/unit/scope_bypass.spec.ts` (counts, existence checks, mode switches in callbacks) and `tests/unit/scope_aggregates.spec.ts` (has-one, many-to-many, has-many-through, self-join alias, plain related model) pass on SQLite and PostgreSQL. With the hook's `isRelatedSubQuery` guard inverted or the install call removed, the aggregate tests fail on counts.

## 2026-10-27: Preserve the scope already installed before subclass hooks

- **Decision:** Reapply an existing scope node at `applyWhere()` time across all where-stack collections. Keep hook-time scope application and group-limit detection unchanged. A later hook switching to `withTrashed()` retains the filter installed earlier; a later `clearWhere()` removes it and remains outside append-only protection.
- **Reason:** Subclass hooks run after inherited hooks. Their appended OR predicates must be regrouped before SQL rendering, but rereading mode here would change write and preview semantics. Bulk-operation macros own their mode semantics.
- **Evidence:** `tests/unit/subclass_hooks.spec.ts` covers appended OR predicates, pagination counts, grouped stacks, modes, reused builders, related reads, aggregates, group limits, and the two hook limitations.

## 2026-10-27: Explicit bulk lifecycle macros

- **Decision:** Add builder `softDelete()` for matching active rows and `forceDelete()` for physical deletion. `onlyTrashed().softDelete()` returns zero; `onlyTrashed().forceDelete()` selects only trashed rows. Other force-delete modes select all matching rows. Builder `delete()` and `del()` retain their physical, unscoped contract; any next-major change is tracked separately in #59.
- **Reason:** Bulk writes bypass instance hooks, custom column preparation and automatic `updatedAt` updates. Explicit methods provide safe lifecycle vocabulary without changing existing Lucid write behavior. Scope predicates belong inside each macro; the shared `applyWhere` wrapper only re-applies an existing scope node.
- **Boundary:** Lucid redirects many-to-many update/delete builders to the pivot table, so both macros and builder `restore()` reject that shape before mutation. Has-many-through update/delete builders render a `select *` sub-query that every supported database rejects, so they are rejected the same way. Callers can select related IDs and query the related model directly. Has-many builders preserve their parent constraint.
- **Evidence:** `tests/unit/builder_lifecycle.spec.ts` covers mode combinations, stored timestamps, repeated/cloned builders, caller predicates, custom columns, transactions, hooks, relation writes and database rejection. Installed-consumer tests exercise the public runtime and declaration exports.

## 2026-10-27: Keep builder `delete()` physical; use explicit lifecycle macros for bulk writes

- **Decision:** Choose option 1 from #59: retain physical, unscoped builder `delete()` and `del()` on soft-delete models. Use the existing builder `restore()` macro and the explicit `softDelete()` and `forceDelete()` macros proposed in #57 for lifecycle operations. No next-major runtime change is planned by this decision.
- **Reason:** Rejecting existing writes would break bulk-delete and related-query callers. Applying read modes to writes would change their selection rules and complicate the shared read-scope wrapper. Explicit operations supply the safe vocabulary without changing the established write contract.
- **Boundaries:** This records the next-major choice only; it does not introduce a version bump, migration, or runtime change for 0.1.0-alpha. A future proposal to reject or scope `delete()` / `del()` must reopen the decision with consumer migration evidence, a major version, migration notes and revised bulk-write contract tests.
- **Evidence:** The existing bulk-write characterisations in `tests/unit/scope_bypass.spec.ts` retain the documented physical-delete contract. #52 documents its hazard; #57 owns the explicit alternative APIs and their tests.

## 2026-10-27: Number the first release 0.1.0-alpha and distribute it through GitHub

- **Decision:** Release the first prerelease of this continuation as `0.1.0-alpha`, tagged `v0.1.0-alpha`, with the `pnpm pack` tarball attached to a GitHub prerelease. Do not publish it to npm. This replaces the planned `3.0.0-alpha.1` npm alpha.
- **Reason:** Owner decision (#84). The package has a new name, so its version line does not need to continue upstream's 2.x numbering.
- **Evidence:** `package.json`, `CHANGELOG.md`, `docs/RELEASING.md`, `SECURITY.md` and the README install instructions name `0.1.0-alpha` and the release tarball.
