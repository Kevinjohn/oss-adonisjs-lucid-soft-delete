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
