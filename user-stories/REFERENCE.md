# Catalogue reference

## Source baseline and scope

Source baseline is fetched `origin/main` commit [`afb27263794e3fbd8202e3c962d6ff1840509ebe`](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/commit/afb27263794e3fbd8202e3c962d6ff1840509ebe). The catalogue covers the public Lucid mixin and builder methods, provider configuration, read behavior, lifecycle writes, receipts, example recovery service and documented query boundaries.

## Roles and product boundary

- **Application developer:** installs and configures the package, adds schema columns, and composes `SoftDeletes` into a Lucid model.
- **Application code:** invokes model or builder APIs inside the host application.
- **Application operator:** controls schema rollout and application operations.

These are integration contexts, not package-defined permission roles. The package exports a model mixin and query methods; it does not expose an end-user UI or implement application authentication, authorization, tenancy, retention or cascade policy.

## Availability and evidence

Current describes an API or setup path present in source under its stated conditions. Operator describes configuration or schema work outside an application UI. Source availability is not runtime verification. Stories link the implementation and relevant existing tests; tests were inspected but not run for this documentation change.

## Source map

| Capability                                | Entry and implementation                                                                                                                          | Behavior contract                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Package configuration                     | [configure](../configure.ts), [provider](../providers/lucid_soft_delete_provider.ts), [builder extension](../src/bindings/model_query_builder.ts) | [Getting started](../docs/guide/getting-started.md)                                                         |
| Instance delete, restore and force delete | [SoftDeletes mixin](../src/mixin.ts)                                                                                                              | [Instance lifecycle](../docs/reference/README.md#instance-lifecycle-methods)                                |
| Default and explicit read modes           | [Mixin hooks](../src/mixin.ts), [applyScope](../src/scope.ts), [mode state](../src/mode.ts)                                                       | [Read modes](../docs/reference/README.md#read-modes), [scope contract](../docs/reference/scope-contract.md) |
| Builder lifecycle methods and receipts    | [Builder macros](../src/bindings/model_query_builder.ts), [receipts](../src/receipts.ts)                                                          | [Builder lifecycle](../docs/reference/README.md#builder-lifecycle-methods)                                  |
| Accepted implementation decisions         | [Maintainer decisions](../docs/maintainers/decisions.md)                                                                                          | [Maintainer internals](../docs/maintainers/internals.md)                                                    |

No application-specific permissions are claimed by these stories. Use the host application's route/service policy and tenant predicates for those concerns.
