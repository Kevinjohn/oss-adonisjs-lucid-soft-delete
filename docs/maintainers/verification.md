# Verification

Use Node.js 24 and pnpm 11. From the repository root, run the standard checks:

```sh
pnpm format:check
pnpm lint
pnpm docs:check
pnpm typecheck
pnpm build
pnpm quick:test
```

The default test database is SQLite. CI also runs PostgreSQL 16 and MySQL 8.4.

## PostgreSQL 16

On macOS, start PostgreSQL and create the test database:

```sh
brew services start postgresql@16
createdb lucid_soft_deletes_test
pg_isready
DB_CLIENT=pg DB_USER="$USER" DB_DATABASE=lucid_soft_deletes_test pnpm test
```

Set `DB_HOST`, `DB_PORT`, or `DB_PASSWORD` for a non-default local setup.

## MySQL 8.4

On macOS, start MySQL and create the test database:

```sh
brew services start mysql@8.4
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS lucid_soft_deletes_test"
DB_CLIENT=mysql pnpm test
```

The lock-wait receipt tests read `performance_schema.data_lock_waits` and
`performance_schema.threads`. Performance Schema must be enabled and the test account needs
`SELECT` access to those tables. The transactions tests also create and drop
`lucid_soft_deletes_second`.

See [Contributing](../../CONTRIBUTING.md) for the installed-package gate and pull-request checks.
