# Lucid internals this package depends on

These notes are for contributors. They name the Lucid 22 internals the scope relies on, where each lives, and which tests cover it. Update the file references when the Lucid pin changes.

## Public entry points and reference coverage

The `exports` map in [package.json](../../package.json) defines supported imports. Generated API
routes below are relative to the documentation site's base; run `pnpm docs:api` to regenerate
their Markdown sources under `docs/reference/api/`.

| Public subpath                 | Source                                    | Reference coverage                                                                                                                                |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| package root                   | `index.ts`                                | `reference/api/index/index`: mixin, capability guard, error aliases and receipt types through root reexports                                      |
| `./types`                      | `src/types/index.ts`                      | Type barrel; its receipt and mixin types are documented through root reexports; no separate TypeDoc entry is needed                               |
| `./types/*`                    | `src/types/*.ts`                          | Current files are `index` (the same barrel) and `querybuilder`; Lucid declaration augmentation is at `reference/api/src/types/querybuilder/index` |
| `./bindings`                   | `src/bindings/model_query_builder.ts`     | `reference/api/src/bindings/model_query_builder/index`                                                                                            |
| `./lucid_soft_delete_provider` | `providers/lucid_soft_delete_provider.ts` | `reference/api/providers/lucid_soft_delete_provider/index`                                                                                        |

`configure.ts` also has a generated page at `reference/api/configure/index` and is reexported
from the root. It is not a separate declared package subpath. Use the authored
[scope contract](../reference/scope-contract.md) for supported query behavior and boundaries.

TypeDoc fails on warnings and validates export reachability, links, rewritten links and merge
annotations. `validation.notDocumented` is disabled; the configured reflection-kind list does
not turn missing comments into an error. Keep this local policy explicit when comparing it
with the stricter Account Kit policy. Comments should explain mutation scope, transaction
ownership, hooks and compatibility where those contracts need explanation. Generated API pages
suppress source edit links; authored guides retain them.

## Deliberate compatibility differences

The root exports descriptive lifecycle exceptions, their existing `E_*` aliases and the
`errors` namespace. Keep those imports stable. Masquerade's request-error union serves a
different domain; it is not a naming template for model lifecycle failures. This package has
no separate `./errors` export; callers use the root exports. Its `./types/*` wildcard remains a
supported declaration entry point. Add an alias only for a concrete compatibility need.

Preserve public error message wording and punctuation when making style changes. Preserve
upstream credit, per-file copyright notices and license text; inherited header phrasing does
not justify rewriting legal attribution.

## Query implementation

Lucid 22 clones model query builders through `ModelQueryBuilder.clone()` and calls the protected
`applyQueryFlags()` method on the clone (`node_modules/@adonisjs/lucid/build/src/orm/query_builder/index.js`).
The provider wraps that method once to preserve the soft-delete mode; the wrapper is guarded by
`Symbol.for('@kevinjohn/adonisjs-lucid-soft-delete/patched')`. The provider also wraps `ModelQueryBuilder.prototype.applyWhere()`, guarded by
`Symbol.for('@kevinjohn/adonisjs-lucid-soft-delete/sub-query-scope')`: when the builder is a relation
sub-query (`isRelatedSubQuery`, not a `where` callback child) for a model with the mixin, the
soft-delete filter is added before the where stack is flushed. Every way Lucid renders a sub-query
(`toKnex()` for `select` and `whereExists`, `toSQL()` for `has` with an operator) passes through
`applyWhere()` after `prepare()` has added the relation constraint. These are the package's two
Lucid prototype hooks; `tests/scope_aggregates.spec.ts` and `tests/scope_bypass.spec.ts`
cover the second.

The default and only-trashed scopes, and builder `restore()`, rewrite Lucid's internal `whereStack`
into one where group and call its `getWrappingMethod()` to rebuild the caller's groups. Lucid's
`applyWhere()` empties `whereStack` when it holds several groups
(`node_modules/@adonisjs/lucid/build/src/database/query_builder/chainable.js:58-76` on 22.4.2), so a
builder that runs twice would otherwise lose the caller's predicates. One group keeps them. A Lucid
change to `whereStack`, `applyWhere()` or `getWrappingMethod()` can break the scope;
`tests/scope.spec.ts` and `tests/builder_restore.spec.ts` cover it.

For group-limited has-many and many-to-many relations, Lucid builds a `row_number()` subquery named
`adonis_group_limit_counter` (`orm/relations/has_many/query_builder.js` and
`orm/relations/many_to_many/query_builder.js`). The soft-delete filter must be added to the inner
Knex builder at `query.knexQuery._single.table` so deleted rows do not consume each parent's limit.
The selected mode is carried on the inner Knex builder because Lucid creates a fresh outer builder
for group-limited execution. Its table alias is also read from that inner builder when qualifying
`deletedAt`.
The package detects that path by inspecting SQL generated from a clone; it never previews the query
that will execute. This depends on Lucid/Knex internals and is covered by group-limit tests.

On Lucid 22.4.2, the tested has-many and many-to-many group-limit paths group callback OR conditions
before the relation key and soft-delete filter. Builder `restore()` does not support a prior
`returning()` clause.

The `applyWhere()` wrapper has two branches: relation subqueries install their scope after
relation constraints are prepared; other non-child builders reapply an existing scope node
from anywhere in the where stack. Reapplication groups predicates appended by subclass hooks
without rereading the mode or installing a missing filter. Fetch and paginate hooks still call
`applyScope()` so group-limit detection runs at hook time, outside the wrapper.

Builder `softDelete()` writes the mapped column with `DateTime.local()` formatted using the
query client's dialect date-time format. Like builder `restore()`, it bypasses custom column
preparation and instance hooks and leaves `updatedAt` unchanged. Each macro replaces earlier
scope nodes while preserving caller predicates. `forceDelete()` groups the caller's predicates in
default/with mode and replaces the earlier scope with `whereNotNull` in only mode. Any builder the
package has grouped is regrouped on every `applyWhere()`.

Lucid's `returning()` is gated by `dialect.supportsReturningStatement` (PostgreSQL only). Knex 3.3.0 compiles `RETURNING` for SQLite `UPDATE` but not `DELETE`, so SQLite uses the select-then-write path. The preselect sets `knexQuery._method = 'select'` and calls `pojo()` on a clone. `knexQuery.client.transacting` is the same transaction test that `QueryRunner.isInTransaction()` uses. mysql2's default `FOUND_ROWS` flag makes `affectedRows` a matched-row count, which equals the changed-row count only because the lifecycle filter guarantees a value change.

Receipt validation also checks Lucid's deferred `groupConstraints` before cloning. Has-many
`groupLimit()` and `groupOrderBy()` do not populate the Knex limit/ordering fields until execution,
and Lucid's relation-builder clones omit them. Rejecting either constraint prevents a receipt write
from silently widening its target selection.

The lifecycle macros and builder `restore()` reject many-to-many and has-many-through relation
builders before writing. Lucid's `ManyToManyQueryBuilder.applyConstraints()` changes the target
to the pivot table for update and delete actions, which would mutate pivot rows instead of
related models. `HasManyThroughQueryBuilder.applyConstraints()` filters update and delete
actions with `whereIn(key, select * from through)`, which the database rejects. Has-many builders
retain their normal relation constraint. As with builder `restore()`, a prior `returning()`
clause is unsupported.
