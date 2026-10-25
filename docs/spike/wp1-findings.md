# WP1 findings

## Runtime

None. The retained upstream suite passes on Node 24 with SQLite and PostgreSQL 16: 17/17 tests on each database. WP1 repaired fixture-only differences in PostgreSQL boolean reads and foreign-key-safe cleanup. The upstream `adonis-lucid-filter` interop test was removed: `adonis-lucid-filter` 5.2.0 declares peers `@adonisjs/core@^6.2.3` and `@adonisjs/lucid@^21.1.0`, so it cannot install beside the AdonisJS 7 peers. No other behavior test was skipped.

## Declarations

The WP1 reproduction against the first toolchain build and the WP4 release-candidate build failed with mixin declaration constraints, a static `withTrashed()` result mismatch, and `useTransaction()` inferred as `any`. WP2 made the builder augmentation reachable from the root entry; WP5 replaced the inferred mixin declaration with named public interfaces and receiver-preserving builder signatures.

**Resolved in WP5.** The current packed `3.0.0-alpha.1` tarball was installed into the throwaway consumer with AdonisJS core 7.6.0, Lucid 22.4.2, and TypeScript 5.9.3. With `skipLibCheck: false`, `pnpm exec tsc --noEmit --skipLibCheck false` exits 0 on Node 24. The consumer asserts that instance `restore()` returns `Promise<User>`, builder `restore()` returns `Promise<number>`, and `useTransaction()` is not `any`; the compiler produced no diagnostics.

## Installed application

**Closed in WP6.** `pnpm test:consumer --compatibility=latest` and `pnpm test:consumer --compatibility=minimum` each pass from a packed tarball on Node 24 with SQLite and PostgreSQL 16. The latest mode resolves current compatible peer releases; the minimum mode installs exact core 7.0.0 and Lucid 22.0.0, so no peer-floor increase is needed. Each run configures the package twice, checks provider counts of zero, one and one, regenerates the schema with `deletedAt`, migrates, typechecks with `skipLibCheck: false`, builds the app and passes its Japa consumer test. The gate also checks the installed package's identity, licence notices and absence of a bundled Lucid query builder. PostgreSQL runs use and remove a fresh schema per run.

The committed slim fixture uses TypeScript 5.9.3 and Node types 25.9.9. It loads Ace command modules through runtime module IDs because the generated Adonis command-index declarations import a `Command` type absent from Ace 14.1.1's declarations. The starter's unused entity-indexing hook was removed after it caused a type mismatch with core 7.0.0; schema generation and all app checks pass without that hook.

The PostgreSQL gate sets Lucid's `searchPath` to a fresh schema. A clean-database run exposed that `PGOPTIONS` alone changes the session path but leaves Lucid's schema generator scanning `public`; after the explicit setting, both peer modes scan zero tables before migration and the newly migrated `users` table afterward. Both generate `deletedAt`, and the temporary schemas are removed. The root PostgreSQL suite passes again after those runs.
