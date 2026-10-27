# Contributing

Use Node.js 24 and pnpm 11. The default suite uses SQLite; CI also runs it on PostgreSQL 16 and MySQL 8.4. Run the repository checks through these scripts:

```bash
pnpm lint
pnpm docs:check
pnpm typecheck
pnpm build
pnpm test
```

`pnpm check:changed [base]` runs only the checks that the files changed since `base` (default
`main`) can affect, including uncommitted and untracked files, and prints one line per step. CI
still runs the full set. Changes to shipped source, package entry points, dependencies, or TypeScript
configuration also select the packed-consumer gate, which requires network access. Changes only
to tests, `bin/` tooling, or prose do not select that gate. The fast local documentation check
runs on every invocation, including prose-only changes; it does not fetch external URLs.

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

## Documentation examples

`pnpm docs:check` checks local Markdown file links and GitHub-style ATX heading anchors, explicit
HTML anchors, source-file line anchors, inline/image/reference links, and marked source-region
examples. It ignores links/headings inside fenced code and inline code; it does not fetch external
URLs. Run it from the repository root. Optional file arguments select a smaller set of Markdown
files; tracked and unignored new Markdown files are checked by default. Keep published guides in
Markdown and use ATX headings (`## Heading`).

For a runnable TypeScript example, keep its implementation in the installed-consumer fixture and
mark the maintained region with `// #region example_name` and `// #endregion example_name`. Put
`<!-- source: relative/path/to/file.ts#example_name -->` immediately before the matching fenced
code in the guide (a blank line is allowed). The path is relative to that Markdown file. The
checker requires the fence to match the region; it does not run Markdown as code.

The README recovery example, tutorial service and cookbook functions are imported by their fixture
tests. `pnpm test:consumer` and `pnpm test:consumer --compatibility=minimum` install the public packed
package into a fresh app, migrate, generate the schema, strictly typecheck, build and exercise those
same functions. When changing a recipe, update its documented source region and meaningful expected
results together. Follow the tutorial setup in a clean disposable directory when changing its setup
commands; a green fixture gate alone does not prove the written setup works.
