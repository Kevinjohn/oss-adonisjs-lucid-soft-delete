# US-APP-08 — Detect model support

As an application developer, I want to identify participating models so shared services can choose a supported operation.

**Status:** Current, source-reviewed.
**Access:** An application developer.
**Entry:** Call `hasSoftDeletes(model)` with a candidate value. A shared service that already has a Lucid constructor can use the result to select a soft-delete integration.
**Documentation:** [Package reference](../../docs/reference/README.md).
**Source:** [index.ts](../../index.ts), [src/guard.ts](../../src/guard.ts), [src/mixin.ts](../../src/mixin.ts).
**Coverage:** [tests/guard.spec.ts](../../tests/guard.spec.ts), [tests/types/model_check.spec.ts](../../tests/types/model_check.spec.ts) (type contract).

## Acceptance criteria

- The type guard tests the SOFT_DELETES symbol for exactly true. A deletedAt column alone does not qualify.
- Null, primitives and unmarked models return false. A true result adds the marker to the existing type. A known Lucid constructor narrows to `SoftDeletesModel`. An unknown value gains only the marker. An object carrying the marker also returns true, including an inherited marker. Establish the Lucid constructor contract separately before invoking model operations.

## User flow

```mermaid
flowchart TD
    A["Receive candidate value"] --> B{"Carries the soft-delete marker?"}
    B -->|Yes| E{"Already known to be a Lucid model?"}
    E -->|Yes| C["Choose lifecycle operation"]
    E -->|No| F["Establish the model contract before calling model operations"]
    B -->|No| D["Choose alternative or refuse operation"]
```

## Code flow

```mermaid
flowchart TD
    S["Call hasSoftDeletes(model)"] --> A{"Non-null object or function?"}
    A -->|No| D["Return false"]
    A -->|Yes| B{"Shared symbol exactly true?"}
    B -->|No| D
    B -->|Yes| C["Return true and narrow type"]
```

**Code references:** [index.ts](../../index.ts), [src/guard.ts](../../src/guard.ts), [src/mixin.ts](../../src/mixin.ts).
