# US-DEV-01 — Configure the provider and model support

As an application developer, I want to register the package provider, add the nullable deletion timestamp to selected tables, and compose `withSoftDeletes` into their models so that Lucid can persist deleted state and scope model reads.

**Status:** Operator; current package setup path.
**Access:** Application developer with permission to configure the app and database schema.
**Entry:** `node ace configure @kevinjohn/adonisjs-lucid-soft-delete`, then an application migration and model composition.
**Documentation:** [Getting started](../../docs/guide/getting-started.md).
**Source:** [Configure hook](../../configure.ts), [provider](../../providers/lucid_soft_delete_provider.ts), [model mixin](../../src/mixin.ts).
**Coverage:** [Configure tests](../../tests/configure.spec.ts), [provider tests](../../tests/provider.spec.ts).

## Acceptance criteria

- Ace configure adds the package provider to `adonisrc.ts`. Rerunning configuration keeps a single provider entry. After application startup, the provider's `boot()` imports Lucid's `ModelQueryBuilder` and calls `extendModelQueryBuilder`.
- For standalone Lucid without the provider, call `extendModelQueryBuilder(ModelQueryBuilder)` from the package bindings before using builder macros and wrappers.
- A soft-deletable table has a nullable timestamp column corresponding to the mixin's `deletedAt` column mapping.
- Composing `withSoftDeletes` into the model installs Lucid fetch hooks and instance lifecycle methods for that model.
- This package does not create application routes, authentication, authorization, migrations, or a user interface.

## User flow

```mermaid
flowchart TD
    A["Install package and Luxon"] --> B["Run the Ace configure command"]
    B --> C["Add nullable deleted_at column"]
    C --> D["Compose withSoftDeletes into the Lucid model"]
    D --> E["Model operations use deletion lifecycle and query scopes"]
```

## Code flow

Scope: configure hook registers provider; provider boot extends Lucid builder; model mixin adds per-model fetch hooks.

```mermaid
flowchart TD
    A["configure command"] --> B["createCodemods"] --> C["updateRcFile and addProvider"] --> D["Provider boot on application startup"] --> E["extendModelQueryBuilder"]
    F["Developer separately composes withSoftDeletes"] --> G["Declare hooks and lifecycle methods"]
    H["Standalone Lucid caller"] --> E
```

**Code references:** [configure](../../configure.ts), [provider boot](../../providers/lucid_soft_delete_provider.ts), [builder extension](../../src/bindings/model_query_builder.ts), [mixin hooks](../../src/mixin.ts), [getting started](../../docs/guide/getting-started.md).
