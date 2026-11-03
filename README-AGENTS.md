# Lucid Soft Delete: notes for AI coding agents

Use this package when an AdonisJS 7 application uses Lucid 22 models and needs recoverable row removal. Repository links work from `node_modules` too.

## Fit check

Requires Node.js 24+, AdonisJS 7 and Lucid 22; supported test databases are SQLite, PostgreSQL 16 and MySQL 8.4. The application owns authorization, deletion policy, tenant filters, retention and cascades. Each soft-deletable table needs a nullable `deleted_at` column mapped by the model's `deletedAt` property.

## Requirements

Use peer dependencies `@adonisjs/core` 7, `@adonisjs/lucid` 22 and `luxon` 3.4.4+, with TypeScript 5.9.3 or 6.0.3+. Compose `SoftDeletes` with `BaseModel`, map nullable `deletedAt` to `deleted_at`, and register the package provider before using query builder macros.

## Install

```sh
pnpm add https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/releases/download/v0.1.2/kevinjohn-adonisjs-lucid-soft-delete-0.1.2.tgz luxon
node ace configure @kevinjohn/adonisjs-lucid-soft-delete
node ace migration:run
```

## Capabilities

Instance `delete()` soft-deletes and runs Lucid hooks; `restore()` clears the timestamp; `forceDelete()` physically deletes. Builder `softDelete()`, `restore()` and `forceDelete()` support bulk operations; receipts require a caller-owned transaction. `withTrashed()` includes both states; `onlyTrashed()` selects deleted rows. See the [API reference](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/blob/main/docs/reference/README.md).

## Invariants: do not break these

1. Ordinary model reads hide deleted rows. `withTrashed()` and `onlyTrashed()` affect the root query; choose a mode in relation callbacks too.
2. Builder `delete()` and `del()` are physical deletes; use explicit lifecycle methods.
3. Builder `forceDelete()` is destructive; keep a trusted caller predicate or selected IDs. Default mode includes active rows.
4. Soft deletion does not authorize writes, cascade to related rows or erase retained data.
5. Raw SQL, pojo queries, joins and embedded subqueries need their own qualified deletion predicate where required.
6. Builder lifecycle methods run no model hooks and do not update `updatedAt`.
7. The package does not own transactions. After a rollback, discard or refresh retained models; see the [transaction reference](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/blob/main/docs/reference/README.md#caller-owned-transactions-and-model-state).

## Testing an application

Follow the [getting started guide](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/blob/main/docs/guide/getting-started.md) to configure the provider, add the column and exercise recovery. Query paths are in the [scope contract](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/blob/main/docs/reference/scope-contract.md).

## Source map

`src/mixin.ts` defines the mixin and instance lifecycle; `src/scope.ts` and `src/sub_query_scope.ts` apply query scopes; `src/receipts.ts` handles bulk receipts; `src/bindings/model_query_builder.ts` registers the query builder macros and `src/types/querybuilder.ts` augments the Lucid types. `providers/` registers the runtime and `tests/` covers behavior, tooling and types.

## Further reading

- [Troubleshooting](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/blob/main/docs/guide/troubleshooting.md) and [Lucid internals](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/blob/main/docs/maintainers/internals.md)

## Tested against

|                         | Every pull request | Weekly and before each release          |
| ----------------------- | ------------------ | --------------------------------------- |
| Node.js                 | 24                 | 24                                      |
| AdonisJS core           | locked version     | lowest supported (7.0.0) and latest 7.x |
| Lucid                   | locked version     | lowest supported and latest 22.x        |
| SQLite (better-sqlite3) | yes                | yes                                     |
| PostgreSQL 16           | yes                | yes                                     |
| MySQL 8.4               | yes                | yes                                     |
