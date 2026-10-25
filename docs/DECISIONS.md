# Decision log

This log records implementation decisions made while delivering version 3.0.0-alpha.1. The PRD defines the product contract; an entry here records how that contract was carried out or why evidence required a change.

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

- **Decision:** Use Lucid's hydrated `$original.deletedAt` to distinguish a pre-write failure from a hook failure after the database update. Restore the previous in-memory timestamp only when the new value was not persisted. Apply this to soft deletion, quiet deletion and restore.
- **Reason:** Lucid hydrates originals after the update and before `afterUpdate` and `afterSave` hooks. Reverting the timestamp after either hook throws would make the instance disagree with its persisted row; leaving a failed pre-write restore cleared would prevent retry on the same instance.
- **Evidence:** New lifecycle regressions failed on the previous WP4 commit for both post-write deletion and pre-write restore failures, then passed on SQLite and PostgreSQL 16. The installed Lucid save sequence is `build/src/orm/base_model/index.js:1553-1559`.
