# WP1 findings

## Runtime

None. The retained upstream suite passes on Node 24 with SQLite and PostgreSQL 16: 17/17 tests on each database. WP1 repaired fixture-only differences in PostgreSQL boolean reads and foreign-key-safe cleanup. The upstream `adonis-lucid-filter` interop test was removed: `adonis-lucid-filter` 5.2.0 declares peers `@adonisjs/core@^6.2.3` and `@adonisjs/lucid@^21.1.0`, so it cannot install beside the AdonisJS 7 peers. No other behavior test was skipped.

## Declarations

A throwaway consumer installed the packed `3.0.0-alpha.1` tarball, AdonisJS core 7.6.0, Lucid 22.4.2, and TypeScript 5.9.3. It composed a `User` with `SoftDeletes`, declared a has-many relation, and compiled with `skipLibCheck: false`. Framework type dependencies were installed so the remaining diagnostics are in this package or its consumer assertions. The command `pnpm exec tsc --noEmit` failed as expected:

```text
consumer.ts(28,37): error TS2344: Type 'ModelQueryBuilderContract<typeof User, User>' does not satisfy the constraint '{ [toStringTag]: string; match: "Expected: function, Actual: function"; join: "Expected: function, Actual: function"; with: "Expected: function, Actual: function"; ... 200 more ...; keysResolver?: ((columnName: string) => string) | undefined; }'.
  Property 'ignoreDeleted' is missing in type 'ModelQueryBuilderContract<typeof User, User>' but required in type '{ [toStringTag]: string; match: "Expected: function, Actual: function"; join: "Expected: function, Actual: function"; with: "Expected: function, Actual: function"; ... 200 more ...; keysResolver?: ((columnName: string) => string) | undefined; }'.
consumer.ts(29,46): error TS2349: This expression is not callable.
  Type 'Inverted<ExpectAny<any>>' has no call signatures.
consumer.ts(31,16): error TS2339: Property 'withTrashed' does not exist on type 'ModelQueryBuilderContract<typeof User, User>'.
installed-package/build/src/mixin.d.ts(79,131): error TS2344: Type 'Self' does not satisfy the constraint 'LucidRow'.
installed-package/build/src/mixin.d.ts(79,517): error TS2344: Type 'Self' does not satisfy the constraint 'LucidRow'.
installed-package/build/src/mixin.d.ts(80,127): error TS2344: Type 'Self' does not satisfy the constraint 'LucidRow'.
installed-package/build/src/mixin.d.ts(80,528): error TS2344: Type 'Self' does not satisfy the constraint 'LucidRow'.
installed-package/build/src/mixin.d.ts(95,103): error TS2344: Type 'Model' does not satisfy the constraint 'LucidModel'.
installed-package/build/src/mixin.d.ts(95,123): error TS2344: Type 'Model' does not satisfy the constraint 'abstract new (...args: any) => any'.
installed-package/build/src/mixin.d.ts(96,126): error TS2344: Type 'Model' does not satisfy the constraint 'LucidModel'.
installed-package/build/src/mixin.d.ts(96,146): error TS2344: Type 'Model' does not satisfy the constraint 'abstract new (...args: any) => any'.
installed-package/build/src/mixin.d.ts(96,198): error TS2344: Type 'Model' does not satisfy the constraint 'LucidModel'.
installed-package/build/src/mixin.d.ts(96,218): error TS2344: Type 'Model' does not satisfy the constraint 'abstract new (...args: any) => any'.
installed-package/build/src/mixin.d.ts(97,75): error TS2344: Type 'Model' does not satisfy the constraint 'abstract new (...args: any) => any'.
installed-package/build/src/mixin.d.ts(97,146): error TS2344: Type 'Model' does not satisfy the constraint 'LucidModel'.
installed-package/build/src/mixin.d.ts(97,206): error TS2344: Type 'Model' does not satisfy the constraint 'LucidModel'.
installed-package/build/src/mixin.d.ts(101,108): error TS2344: Type 'Model' does not satisfy the constraint 'LucidModel'.
installed-package/build/src/mixin.d.ts(105,108): error TS2344: Type 'Model' does not satisfy the constraint 'LucidModel'.
installed-package/build/src/mixin.d.ts(105,128): error TS2344: Type 'Model' does not satisfy the constraint 'abstract new (...args: any) => any'.
```

The emitted `build/src/mixin.d.ts` still contains `restore(): Promise<any>` and `useTransaction(...): any` (shown there as `/*elided*/ any`). The root import does not reach the builder augmentation, so `User.query().withTrashed()` is absent. The `withTrashed()` static also carries the upstream result-type mismatch. WP2 addresses augmentation discovery; WP5 addresses the mixin and builder signatures. No declaration behavior was changed to hide these reproductions.
