# Contributing

Bug reports and pull requests are welcome. The package is pre-release; discuss larger changes in
an issue before implementation.

## Before you start

- For a bug, open an issue with a reproduction first, unless the fix is a one-line change.
- For a feature or behavior change, open an issue to agree the shape before writing code.
- Report security problems privately as described in [SECURITY.md](SECURITY.md). Do not open a
  public issue.

## Project principles

Every change follows these.

- **Built for everyone who uses AdonisJS.** Follow the open-source AdonisJS packages and starter
  kits for names, shapes and behavior. Match AdonisJS Plus only where that costs nothing; Plus
  compatibility is not a goal and never outweighs consistency for open-source users.
- **The application owns its language.** Do what the official AdonisJS packages do: look up
  user-facing text through `@adonisjs/i18n` when the application uses it, with English as the
  fallback. No locale detection, no package language setting, and no translations or loader
  shipped in the package.

## Local setup

You need Node.js 24 and pnpm. The repository pins Node 24 in `.nvmrc`; `better-sqlite3` is compiled
against it and tests can fail under another Node major.

```sh
nvm use
pnpm install
pnpm quick:test
```

## Checks

`pnpm check` runs the quick profile (`--full` adds the rest).

Run the repository scripts, not the bare tools:

| Script                      | What it does                                                              |
| --------------------------- | ------------------------------------------------------------------------- |
| `pnpm format:check`         | Checks Prettier formatting on tracked files                               |
| `pnpm lint`                 | Runs ESLint with the AdonisJS config                                      |
| `pnpm docs:check`           | Checks local Markdown links, headings and source markers                  |
| `pnpm docs:build`           | Builds generated API references and the documentation site                |
| `pnpm typecheck`            | Runs TypeScript without emitting                                          |
| `pnpm build`                | Compiles the package to `build/`                                          |
| `pnpm quick:test`           | Runs the Japa suite against SQLite                                        |
| `pnpm test`                 | Runs lint, then the coverage-checked SQLite suite                         |
| `pnpm test:built-exports`   | Runs the built package export specs                                       |
| `pnpm test:pg`              | Runs the suite against a local PostgreSQL 16 cluster                      |
| `pnpm test:mysql`           | Runs the suite against MySQL 8.4                                          |
| `pnpm test:consumer`        | Installs the packed package into a fresh example app and checks its setup |
| `pnpm check:changed [base]` | Runs the checks selected for changed files since `base`                   |

Use `pnpm test:pg` for the throwaway local PostgreSQL setup or set `DB_CLIENT=pg` and the
`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_DATABASE` variables to use your own server.
For MySQL 8.4, start the service, create `package_test`, and run `pnpm test:mysql` (which sets `DB_CLIENT=mysql2`). Lock-wait receipt tests read `performance_schema.data_lock_waits`
and `performance_schema.threads`, so Performance Schema must be enabled and the test account needs
`SELECT` access to those tables. The transaction tests also create and drop
`lucid_soft_delete_second`.

`pnpm test` runs the SQLite suite under c8 after linting. CI also runs the suite on PostgreSQL 16
and MySQL 8.4, and tests the minimum and latest supported peer versions. The packed consumer gate
runs `pnpm test:consumer` and `pnpm test:consumer --compatibility=minimum`; both pack this package,
install it into a fresh example application, and run configure, schema generation, migration,
typecheck, production build and app checks. It requires network access for fixture dependencies.

The _Tested against_ table in `README.md` mirrors `.github/workflows/checks.yml` and `compat.yml`; change them in the same PR.

## Code layout

- `src/` holds the implementation, including bindings and public types.
- `providers/` holds the AdonisJS provider.
- `tests/` mirrors the source and includes tooling and type-level specs; `tests/helpers.ts` holds
  shared fixtures.
- `bin/` holds repository scripts; `bin/helpers/` holds modules used only by those scripts.
- `examples/` contains the application used by the packed-consumer check.
- `docs/` contains the guides, recipes, reference and maintainer notes.

[AGENTS.md](AGENTS.md) describes the file-size and file-splitting rules the codebase follows.

## Planning files

Private plans, PRDs and review notes live in a gitignored `plans/` directory, or as `PLAN*.md` and
`__*.md` in the root; `.gitignore` keeps them out of commits. Delete a plan once its work has
landed. Reference material for contributors goes in `docs/maintainers/` instead.

## Pull requests

- Keep each pull request to one issue.
- Add or update tests. A bug fix should include a test that fails without the fix.
- Update the relevant page in `docs/` and add a line under `## Unreleased` in
  [CHANGELOG.md](CHANGELOG.md) when behavior visible to users changes.
- Write commit messages in the imperative mood, describing the change.

## Repository-specific

### Lucid internals

The query scope relies on a few Lucid 22 internals. [docs/maintainers/internals.md](docs/maintainers/internals.md)
names each one, where it lives in Lucid, and the tests that cover it. Check them when upgrading Lucid.

### Documentation examples

`pnpm docs:check` checks local Markdown links and GitHub-style ATX heading anchors, explicit HTML
anchors, source-file line anchors, inline/image/reference links, and marked source-region examples.
It ignores links and headings inside fenced code and inline code; it does not fetch external URLs.
Run it from the repository root. Optional file arguments select a smaller set of Markdown files.
The checker requires marked code fences to match their source regions; it does not execute
Markdown as code.

For a runnable TypeScript example, keep its implementation in the example application and mark
the maintained region with `// #region example_name` and `// #endregion example_name`. Put
`<!-- source: relative/path/to/file.ts#example_name -->` immediately before the matching fenced
code in the guide. Update the source and expected results together when changing a recipe.

### MySQL

The supported MySQL version is 8.4. Lock-wait receipt tests query Performance Schema tables and
need `SELECT` access; transaction tests create and drop `lucid_soft_delete_second`. Confirm those
test-only prerequisites with the database administrator when using a restricted account.

## Code of conduct

Everyone taking part in this project follows the [code of conduct](CODE_OF_CONDUCT.md).
