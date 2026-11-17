# Catalogue reference

## Source baseline and scope

Initial catalogue baseline is fetched `origin/main` commit [`c5e2aedd3743f5b281cf933eea892cc7cfa6e7e2`](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/commit/c5e2aedd3743f5b281cf933eea892cc7cfa6e7e2). The administrator policy in the demo stories is reconciled to the v0.13.0 starter app source. The catalogue covers the public Lucid mixin and builder methods, provider configuration, read behavior, lifecycle writes, receipts, the example group recovery service, the account deletion and deleted-user restore flows in the [API](https://github.com/Kevinjohn/oss-adonisjs-starter-examples/tree/v0.13.0/apps/api) and [hypermedia](https://github.com/Kevinjohn/oss-adonisjs-starter-examples/tree/v0.13.0/apps/hypermedia) apps, and documented query boundaries.

## Roles and product boundary

- **Application developer:** installs and configures the package, adds schema columns, and composes `SoftDeletes` into a Lucid model.
- **Application code:** invokes model or builder APIs inside the host application.
- **Authenticated user and soft-delete administrator:** Demo-only roles in the starter apps; an administrator is an existing account enrolled by the operator with the `is_soft_delete_admin` database flag. Local package fixtures retain tests for native-auth behavior, including public-signup denial and administrator revocation.
- **Application operator:** controls schema rollout and application operations.

These are integration contexts, not package-defined permission roles. The package exports a model mixin and query methods; it does not expose an end-user UI or implement application authentication, authorization, tenancy, retention or cascade policy.

## Availability and evidence

Current describes an API or setup path present in source under its stated conditions. Demo describes a flow present only in the example or starter apps. Operator describes configuration or schema work outside an application UI. Source availability is not runtime verification. Stories link the implementation and relevant existing tests; tests were inspected but not run for this documentation change.

## Source map

| Capability                                 | Entry and implementation                                                                                                                                                                                                                             | Behavior contract                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Package configuration                      | [configure](../configure.ts), [provider](../providers/lucid_soft_delete_provider.ts), [builder extension](../src/bindings/model_query_builder.ts)                                                                                                    | [Getting started](../docs/guide/getting-started.md)                                                         |
| Instance delete, restore and force delete  | [SoftDeletes mixin](../src/mixin.ts)                                                                                                                                                                                                                 | [Instance lifecycle](../docs/reference/README.md#instance-lifecycle-methods)                                |
| Default and explicit read modes            | [Mixin hooks](../src/mixin.ts), [applyScope](../src/scope.ts), [mode state](../src/mode.ts)                                                                                                                                                          | [Read modes](../docs/reference/README.md#read-modes), [scope contract](../docs/reference/scope-contract.md) |
| Builder lifecycle methods and receipts     | [Builder macros](../src/bindings/model_query_builder.ts), [receipts](../src/receipts.ts)                                                                                                                                                             | [Builder lifecycle](../docs/reference/README.md#builder-lifecycle-methods)                                  |
| Starter account deletion and admin restore | [API app routes](https://github.com/Kevinjohn/oss-adonisjs-starter-examples/blob/v0.13.0/apps/api/start/routes.ts), [hypermedia app routes](https://github.com/Kevinjohn/oss-adonisjs-starter-examples/blob/v0.13.0/apps/hypermedia/start/routes.ts) | [Instance lifecycle](../docs/reference/README.md#instance-lifecycle-methods)                                |
| Example group recovery                     | [group_recovery.ts](../examples/app/app/services/group_recovery.ts)                                                                                                                                                                                  | [Recipes](../docs/recipes/index.md)                                                                         |
| Accepted implementation decisions          | [Maintainer decisions](../docs/maintainers/decisions.md)                                                                                                                                                                                             | [Maintainer internals](../docs/maintainers/internals.md)                                                    |

The package defines no permissions. The only application-specific permission in these stories is the starter administrator rule (an operator-enrolled existing account with `is_soft_delete_admin` set) in [US-DEMO-02](example-apps/us-demo-02-api-admin-restore.md) and [US-DEMO-04](example-apps/us-demo-04-hypermedia-admin-restore.md). Elsewhere, use the host application's route/service policy and tenant predicates for those concerns.
