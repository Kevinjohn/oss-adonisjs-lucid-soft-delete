# Lucid internals this package depends on

These notes are for contributors. They name the Lucid 22 internals the scope relies on, where each lives, and which tests cover it. Update the file references when the Lucid pin changes.

Lucid 22 clones model query builders through `ModelQueryBuilder.clone()` and calls the protected
`applyQueryFlags()` method on the clone (`node_modules/@adonisjs/lucid/build/src/orm/query_builder/index.js`).
The provider wraps that method once to preserve the soft-delete mode; the wrapper is guarded by
`Symbol.for('@kevinjohn/lucid-soft-deletes/patched')`. The provider also wraps `ModelQueryBuilder.prototype.applyWhere()`, guarded by
`Symbol.for('@kevinjohn/lucid-soft-deletes/sub-query-scope')`: when the builder is a relation
sub-query (`isRelatedSubQuery`, not a `where` callback child) for a model with the mixin, the
soft-delete filter is added before the where stack is flushed. Every way Lucid renders a sub-query
(`toKnex()` for `select` and `whereExists`, `toSQL()` for `has` with an operator) passes through
`applyWhere()` after `prepare()` has added the relation constraint. These are the package's two
Lucid prototype hooks; `tests/unit/scope_aggregates.spec.ts` and `tests/unit/scope_bypass.spec.ts`
cover the second.

The default and only-trashed scopes, and builder `restore()`, rewrite Lucid's internal `whereStack`
into one where group and call its `getWrappingMethod()` to rebuild the caller's groups. Lucid's
`applyWhere()` empties `whereStack` when it holds several groups
(`node_modules/@adonisjs/lucid/build/src/database/query_builder/chainable.js:58-76` on 22.4.2), so a
builder that runs twice would otherwise lose the caller's predicates. One group keeps them. A Lucid
change to `whereStack`, `applyWhere()` or `getWrappingMethod()` can break the scope;
`tests/unit/scope.spec.ts` and `tests/unit/builder_restore.spec.ts` cover it.

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
scope nodes while preserving caller predicates. `forceDelete()` removes an earlier lifecycle
scope in default/with mode, or replaces it with `whereNotNull` in only mode.

The lifecycle macros reject many-to-many relation builders before writing: Lucid's
`ManyToManyQueryBuilder.applyConstraints()` changes the target to the pivot table for update
and delete actions. This would mutate pivot rows instead of related models. Has-many builders
retain their normal relation constraint. As with builder `restore()`, a prior `returning()`
clause is unsupported.
