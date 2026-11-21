# US-APP-10 — Load related records with the intended deletion scope

As an application developer, I want to select the right related rows so details and summary counts agree.

**Status:** Current, source-reviewed.
**Access:** An application developer.
**Entry:** Use Lucid preload, load, related queries, aggregates or existence checks.
**Documentation:** [Package reference](../../docs/reference/README.md).
**Source:** [src/mixin.ts](../../src/mixin.ts), [src/sub_query_scope.ts](../../src/sub_query_scope.ts), [src/propagation.ts](../../src/propagation.ts).
**Coverage:** [tests/scope_relations.spec.ts](../../tests/scope_relations.spec.ts), [tests/scope_bypass.spec.ts](../../tests/scope_bypass.spec.ts), [tests/group_limit.spec.ts](../../tests/group_limit.spec.ts).

## Acceptance criteria

- When the related model uses `SoftDeletes`, has-one, has-many, belongs-to, many-to-many and nested or through reads default to active rows. A hidden has-one can yield no related record.
- An explicit mode on the related query can include or isolate trashed children. With the provider installed, counts, aggregates and existence checks scope the related model. Raw joins and arbitrary SQL subqueries need explicit predicates.

## User flow

```mermaid
flowchart TD
    A["Choose relation and related read mode"] --> B["Request related rows or summary"] --> C["Inspect results in that mode"]
```

## Code flow

```mermaid
flowchart TD
    A["Construct related query"] --> B{"Read path?"}
    B -->|Load or preload| C["Related model hooks applyScope"]
    B -->|Aggregate or existence| D["Wrapped applyWhere invokes applySubQueryScope"]
    C --> E["Apply related model mode"]
    D --> E
    E --> F["Fetch or aggregate"]
```

**Code references:** [src/mixin.ts](../../src/mixin.ts), [src/sub_query_scope.ts](../../src/sub_query_scope.ts), [src/propagation.ts](../../src/propagation.ts).
