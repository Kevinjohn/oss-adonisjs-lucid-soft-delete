# Contributing

Use Node.js 24 and pnpm 11. The default suite uses SQLite; CI also runs it on PostgreSQL 16 and MySQL 8.4. Run the repository checks through these scripts:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

`pnpm check:changed [base]` runs only the checks that the files changed since `base` (default
`main`) can affect, including uncommitted and untracked files, and prints one line per step. CI
still runs the full set.

## PostgreSQL

To run the runtime suite against PostgreSQL 16 on macOS, start the local service and create the
test database:

```bash
brew services start postgresql@16
createdb lucid_soft_deletes_test
pg_isready
DB_CLIENT=pg DB_USER="$USER" DB_DATABASE=lucid_soft_deletes_test pnpm test
```

Set `DB_HOST`, `DB_PORT`, or `DB_PASSWORD` as needed for a non-default local PostgreSQL setup.

## MySQL

For MySQL 8.4 on macOS, start the Homebrew service, create the test database, and run with
`DB_CLIENT=mysql`. The transactions test also creates and drops `lucid_soft_deletes_second`:

```bash
brew services start mysql@8.4
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS lucid_soft_deletes_test"
DB_CLIENT=mysql pnpm test
```

## Installed-package gate

The installed-package gate builds and packs this package, installs it into a fresh copy of the
AdonisJS fixture app, and runs configure, schema generation, migration, typecheck, production build,
and app tests. It requires network access for the fixture dependencies:

```bash
pnpm test:consumer
pnpm test:consumer --compatibility=minimum
```

## Pull requests

- Branch from `main`. Name the branch `<type>-<issue>-<slug>`, for example `test-12-delete-quietly-paths`.
- One issue per pull request. Start the body with `Fixes #<issue>`, then a `## Change` section and a `## Verification` section.
- A behaviour change or bug fix ships with a test that fails without it. Say in the body which line was broken to make the test fail.
- Lint, typecheck and the SQLite suite must pass locally. CI runs the suite on SQLite, PostgreSQL and MySQL, the minimum peer versions and the installed-package gate.
- Record a decision that the code cannot explain by itself in `docs/DECISIONS.md`.
