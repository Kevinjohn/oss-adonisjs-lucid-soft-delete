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
