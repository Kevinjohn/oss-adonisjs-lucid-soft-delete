# Agent instructions

## Node version

- Use Node 24 (`.nvmrc`) for every command. CI tests Node 24 only. `better-sqlite3` is compiled
  against it; under Node 22 the test suite fails with `NODE_MODULE_VERSION` errors.
- `.nvmrc` pins Node 24. If the shell starts on another version, run `nvm use` before using `pnpm`.

## Project principles

The same rules as `CONTRIBUTING.md`; every change follows them.

- **Built for everyone who uses AdonisJS.** Follow the open-source AdonisJS packages and starter
  kits for names, shapes and behavior. Match AdonisJS Plus only where that costs nothing; Plus
  compatibility is not a goal and never outweighs consistency for open-source users.
- **The application owns its language.** Do what the official AdonisJS packages do: look up
  user-facing text through `@adonisjs/i18n` when the application uses it, with English as the
  fallback. No locale detection, no package language setting, and no translations or loader
  shipped in the package.

## Checks

- `pnpm check` runs formatting, lint, local docs checks, types, SQLite tests, build and built exports.
- `pnpm check --full` appends PostgreSQL, coverage, MySQL and the default installed consumer.
  This repository deliberately runs `pnpm docs:build` separately; full does not include it.
- `pnpm format:check` checks formatting on tracked files.
- `pnpm lint` runs ESLint with the AdonisJS config.
- `pnpm docs:check` checks local Markdown links, headings and source markers.
- `pnpm typecheck` runs TypeScript without emitting files.
- `pnpm build` compiles the package to `build/`.
- `pnpm quick:test` runs the Japa suite against SQLite.
- `pnpm test` runs lint, then the SQLite suite under c8 coverage thresholds.
- `pnpm test:built-exports` runs the built package export specs.
- `pnpm test:pg` runs the suite against a local PostgreSQL 16 cluster.
- `pnpm test:mysql` runs the suite against MySQL 8.4.
- `pnpm test:consumer` installs the packed package into the example application.
- `pnpm check:changed [--static] [base]` runs checks selected for files changed since `base`;
  `--static` leaves out the full test suite and the consumer gate.
- `pnpm format` writes formatting.
- `pnpm pg:start` and `pnpm pg:stop` manage the local PostgreSQL 16 cluster.
- `pnpm docs:api`, `pnpm docs:dev` and `pnpm docs:build` generate the API reference and run the docs site.

## Single Responsibility Principle (files)

Each file does one thing and is named for it. This keeps the codebase easy to hold in your head,
even if it means more files.

1. One responsibility per file. If you need "and" to describe it, it is two files.
2. Name the file for the responsibility. A reader should guess what
   `src/bindings/model_query_builder.ts` does without opening it.
3. Split at a seam, not at a line count. A seam is a group of functions that share data or a
   purpose and that the rest of the file only calls. A file that just forwards calls is not a
   seam; leave it in place.
4. Size is a prompt, not a rule. At about 800 lines, look for a seam. At about 1,500, split in the
   next change that touches the file. A file kept large on purpose (a data table, generated code,
   one long table-driven test) says why in a short comment at the top.
5. Keep the entry point. The original file re-exports what its importers use, so nothing outside
   the directory changes.
6. Move, do not edit. A split commit only moves code. Run the repository scripts before any
   further change.
7. Tests follow the source. One spec per module or closely related pair. Shared fixtures go in
   `tests/helpers/` once. Do not rename tests while moving them.
8. Small and cohesive is finished. Do not split a file that is under the first threshold and
   does one thing.

## Folder layout

```text
index.ts                    public entry
configure.ts                `node ace configure` hook
providers/<name>_provider.ts
commands/                   Ace commands, where they exist
services/main.ts            container service, where it exists
stubs/                      configure templates, where they exist
src/                        implementation; src/types.ts and src/errors.ts for public types and errors
<subpath>/main.ts           top-level folder ONLY when it backs a package.json export
bin/                        scripts run by package.json (.ts via ts-exec; .sh allowed)
bin/helpers/                modules used only by bin/
tests/                      Japa specs, flat
tests/helpers/              shared test helpers
tests/fixtures/              static fixtures
tests/tooling/               specs for bin/
tests/types/                 type-level tests (.ts), where they exist
examples/                    example apps
docs/                        guides, recipes, reference and maintainer records
```

The shared database and model fixtures live in `tests/helpers.ts`; there is no `tests/helpers/`
directory yet. Keep them in that file unless a concrete responsibility seam justifies a
directory. Documentation ownership is
described in [the maintainer guide](docs/maintainers/README.md).

1. A top-level folder exists only for an exported subpath. Anything else goes in `src/`.
2. Scripts are `.ts` under `bin/`, run with `node --import=@poppinss/ts-exec`. Use `.mjs` only
   when the script must run before dependencies are installed, and say why in a comment at the top.
3. One Japa config: `files: ['tests/**/*.spec.ts']`, no suites, no `node --test` scripts.
4. No `scripts/` folder.

## Repository-specific

The query scope relies on Lucid 22 internals. [docs/maintainers/internals.md](docs/maintainers/internals.md)
names each one, where it lives in Lucid, and the tests that cover it. Check them when upgrading
Lucid.
