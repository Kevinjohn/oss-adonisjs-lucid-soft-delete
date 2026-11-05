# Verification

Use Node.js 24 and pnpm 11. From the repository root, run the standard checks:

```sh
pnpm format:check
pnpm lint
pnpm docs:check
pnpm docs:build
pnpm typecheck
pnpm build
pnpm test
pnpm test:built-exports
pnpm test:pg
pnpm test:mysql
pnpm test:consumer
pnpm test:consumer --compatibility=minimum
```

The default test database is SQLite. CI also runs PostgreSQL 16 and MySQL 8.4.

## Documentation links and release history

The default `pnpm docs:check` selection excludes `CHANGELOG.md`: historical relative paths can
age out when documentation moves. Preserve dated release prose and external artifact URLs.
When editing current-relative changelog links, check that file explicitly:

```sh
pnpm docs:check CHANGELOG.md
```

Correct a proven broken current-relative destination, or use an immutable historical source
when the original artifact was intentionally removed. The checker validates local paths,
heading anchors and maintained source examples; it does not fetch external URLs. A successful
default check does not establish that the excluded changelog or remote release links work.

## PostgreSQL 16

On macOS, `pnpm test:pg` starts a managed PostgreSQL 16 cluster with the `package_test`
role and database, runs the suite, and stops the cluster. Set `DB_PORT` when the default
managed port is in use.

To use an existing PostgreSQL service instead:

```sh
brew services start postgresql@16
createdb package_test
pg_isready
DB_CLIENT=pg DB_USER="$USER" DB_DATABASE=package_test pnpm quick:test
```

Set `DB_HOST`, `DB_PORT`, or `DB_PASSWORD` for a non-default local setup.

## MySQL 8.4

On macOS, start MySQL and create the test database:

```sh
brew services start mysql@8.4
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS package_test"
pnpm test:mysql
```

`pnpm test:mysql` sets `DB_CLIENT=mysql2` and runs the MySQL suite. The lock-wait receipt tests
read `performance_schema.data_lock_waits` and `performance_schema.threads`. Performance Schema
must be enabled and the test account needs `SELECT` access to those tables. The transactions
tests also create and drop `lucid_soft_delete_second`.

See [Contributing](../../CONTRIBUTING.md) for the installed-package gate and pull-request checks.

## Dependency audit assessment — 2026-11-05

This snapshot assesses the committed root and `examples/app` lockfiles at
`960a03e0d1d162446d9b3fd4ae263676872a43b7`, using Node 24.22.2 and pnpm 11.23.0.
`pnpm audit --json` reports 12 advisory IDs in the root graph and two in the example
graph: 14 advisory × graph occurrences. No dependency version changes are selected
for this snapshot. This maintainer assessment is intentionally hosted on GitHub.

The table preserves each advisory ID; each link contains the advisory's affected
conditions and remediation details. A tooling path is not proof that every use is
unreachable. The root declares integrations as peers: a zero-package production
audit at the root does not assess an installed consumer or establish production safety.

| Advisory                                                                 | Resolved package   | Graph and parent path                                                                    | Outcome                                                                         |
| ------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | `esbuild@0.21.5`   | Root: VitePress → Vite → esbuild (also via plugin-vue)                                   | Owner-deferred: keep the stable documentation toolchain.                        |
| [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | `vite@5.4.21`      | Root: VitePress → Vite (also via plugin-vue)                                             | Owner-deferred: keep Vite 5; no major or prerelease migration.                  |
| [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | `vite@5.4.21`      | Root: VitePress → Vite (also via plugin-vue)                                             | Owner-deferred: keep Vite 5; no major or prerelease migration.                  |
| [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) | `vite@5.4.21`      | Root: VitePress → Vite (also via plugin-vue)                                             | Owner-deferred: keep Vite 5; no major or prerelease migration.                  |
| [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | `vite@5.4.21`      | Root: VitePress → Vite (also via plugin-vue)                                             | Owner-deferred: keep Vite 5; no major or prerelease migration.                  |
| [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | `vite@5.4.21`      | Root: VitePress → Vite (also via plugin-vue)                                             | Owner-deferred: keep Vite 5; no major or prerelease migration.                  |
| [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | `vite@5.4.21`      | Root: VitePress → Vite (also via plugin-vue)                                             | Owner-deferred: keep Vite 5; no major or prerelease migration.                  |
| [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) | `vite@5.4.21`      | Root: VitePress → Vite (also via plugin-vue)                                             | Owner-deferred: keep Vite 5; no major or prerelease migration.                  |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | `vite@5.4.21`      | Root: VitePress → Vite (also via plugin-vue)                                             | Owner-deferred: keep Vite 5; no major or prerelease migration.                  |
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | `deepmerge@4.3.1`  | Root and example: Lucid → deepmerge                                                      | Upstream-blocked: no patched release in the audit metadata.                     |
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | `glob@13.0.6`      | Root: c8 → test-exclude → glob                                                           | Retained pending a compatible coverage parent update; no forced major override. |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | `minimatch@10.2.6` | Root and example: ESLint tooling and Assembler → ts-morph → @ts-morph/common → minimatch | Retained pending compatible parent updates; no forced major override.           |

The root and example use minimatch 10.2.6. Both are in the recorded
affected range. Root optional-peer paths and the example's installed Core/Lucid
paths differ, so dependency labels alone do not establish runtime applicability.
Deepmerge has a real dependency path through Lucid; application input and merge
usage still require assessment.

Minimatch 3.1.5 is outside the corrected advisory range (`>=7.0.0 <11.0.1`); it is
not an additional occurrence in this assessment. The root's glob 13 and minimatch
10 paths remain unchanged.

### Follow-up register

- Reassess a supported Lucid release when it removes or patches deepmerge. Do not
  infer that a replacement preserves behavior from an audit count.
- Reassess supported ESLint, TypeDoc, ts-morph and coverage parent releases when
  they adopt patched minimatch/glob versions; test their actual file selection.
- Reconsider VitePress only when a compatible stable security path is available or
  a future toolchain migration is separately chosen. Keep development servers
  restricted to trusted environments and review the linked advisory conditions.

This register creates no upstream issue, subscription or scheduled monitoring.
Refresh the installed consumer graph and advisory facts before a future release;
this dated assessment is not a security guarantee.
