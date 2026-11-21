# US-APP-12 — Expose deletion state in a model response

As an application developer, I want to choose how to expose deletion state so clients receive the intended fields.

**Status:** Current, source-reviewed.
**Access:** An application developer.
**Entry:** Read the trashed getter or serialise the loaded model.
**Documentation:** [Package reference](../../docs/reference/README.md).
**Source:** [src/mixin.ts](../../src/mixin.ts).
**Coverage:** [tests/serialization.spec.ts](../../tests/serialization.spec.ts), [tests/model.spec.ts](../../tests/model.spec.ts).

## Acceptance criteria

- The mixin provides deletedAt and a derived trashed getter. Active records have a null timestamp. The getter evaluates false on projections that omit deletedAt, so select the attribute when deletion state matters.
- Ordinary serialisation includes the mapped date and omits the getter. A model can use a customised column mapping or serializeAs null to hide the timestamp.

## User flow

```mermaid
flowchart TD
    A["Choose projection and representation"] --> B{"Need deletion state?"}
    B -->|Yes| C["Select deletedAt; optionally derive trashed"] --> D["Return representation"]
    B -->|No| D
```

## Code flow

```mermaid
flowchart TD
    A["Loaded model"] --> B["Caller reads trashed getter"] --> D["Getter checks deletedAt is neither null nor undefined"]
    A --> C["Ordinary Lucid serialisation uses configured fields without trashed getter"]
```

**Code references:** [src/mixin.ts](../../src/mixin.ts).
