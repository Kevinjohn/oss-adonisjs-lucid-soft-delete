# WP1 findings

## Runtime

None. The retained upstream suite passes on Node 24 with SQLite and PostgreSQL 16: 17/17 tests on each database. WP1 repaired fixture-only differences in PostgreSQL boolean reads and foreign-key-safe cleanup. No behavior test was skipped.

## Declarations

The WP1 reproduction against the first toolchain build and the WP4 release-candidate build failed with mixin declaration constraints, a static `withTrashed()` result mismatch, and `useTransaction()` inferred as `any`. WP2 made the builder augmentation reachable from the root entry; WP5 replaced the inferred mixin declaration with named public interfaces and receiver-preserving builder signatures.

**Resolved in WP5.** The current packed `3.0.0-alpha.1` tarball was installed into the throwaway consumer with AdonisJS core 7.6.0, Lucid 22.4.2, and TypeScript 5.9.3. With `skipLibCheck: false`, `pnpm exec tsc --noEmit --skipLibCheck false` exits 0 on Node 24. The consumer asserts that instance `restore()` returns `Promise<User>`, builder `restore()` returns `Promise<number>`, and `useTransaction()` is not `any`; the compiler produced no diagnostics.
