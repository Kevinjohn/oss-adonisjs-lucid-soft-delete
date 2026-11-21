# US-DEMO-08 — Delete your own account in React and Vue

As a signed-in starter user, I want to confirm deletion so my account is hidden and my web session ends.

**Status:** Demo, source-reviewed.
**Access:** A signed-in starter user.
**Entry:** GET then POST /account/delete.
**Documentation:** [Package reference](../../docs/reference/README.md).
**Source:** [examples/starter/inertia_react/start/routes.ts](../../examples/starter/inertia_react/start/routes.ts), [examples/starter/inertia_react/app/controllers/account_deletion_controller.ts](../../examples/starter/inertia_react/app/controllers/account_deletion_controller.ts), [examples/starter/inertia_react/inertia/pages/account/delete.tsx](../../examples/starter/inertia_react/inertia/pages/account/delete.tsx), [examples/starter/inertia_vue/start/routes.ts](../../examples/starter/inertia_vue/start/routes.ts), [examples/starter/inertia_vue/app/controllers/account_deletion_controller.ts](../../examples/starter/inertia_vue/app/controllers/account_deletion_controller.ts), [examples/starter/inertia_vue/inertia/pages/account/delete.vue](../../examples/starter/inertia_vue/inertia/pages/account/delete.vue).
**Coverage:** [examples/starter/inertia_react/tests/functional/soft_delete.spec.ts](../../examples/starter/inertia_react/tests/functional/soft_delete.spec.ts), [examples/starter/inertia_vue/tests/functional/soft_delete.spec.ts](../../examples/starter/inertia_vue/tests/functional/soft_delete.spec.ts).

## Acceptance criteria

- GET renders the confirmation. Both routes require a signed-in session.
- POST deletes only the authenticated user, then logs out the web guard and redirects to login. The stored account remains recoverable. A write failure propagates before logout; guests are redirected to login.

## User flow

```mermaid
flowchart TD
    A["Open confirmation"] --> B{"Signed in?"}
    B -->|No| C["Redirect to login"]
    B -->|Yes| D["Read confirmation"] --> E{"Submit deletion?"}
    E -->|No| F["Leave without changes"]
    E -->|Yes| G{"Deletion succeeds?"}
    G -->|No| H["Receive error"]
    G -->|Yes| I["Account hidden; logged out and redirected"]
```

## Code flow

```mermaid
flowchart TD
    A["GET or POST /account/delete"] --> B{"Authenticated web session?"}
    B -->|No| C["Redirect to login"]
    B -->|Yes| D{"Method?"}
    D -->|GET| E["inertia.render account/delete"]
    D -->|POST| F["auth.getUserOrFail then user.delete"]
    F -->|Failure| X["Propagate error"]
    F -->|Success| G["web.logout"] --> H["Redirect session.create"]
```

**Code references:** [examples/starter/inertia_react/start/routes.ts](../../examples/starter/inertia_react/start/routes.ts), [examples/starter/inertia_react/app/controllers/account_deletion_controller.ts](../../examples/starter/inertia_react/app/controllers/account_deletion_controller.ts), [examples/starter/inertia_react/inertia/pages/account/delete.tsx](../../examples/starter/inertia_react/inertia/pages/account/delete.tsx), [examples/starter/inertia_vue/start/routes.ts](../../examples/starter/inertia_vue/start/routes.ts), [examples/starter/inertia_vue/app/controllers/account_deletion_controller.ts](../../examples/starter/inertia_vue/app/controllers/account_deletion_controller.ts), [examples/starter/inertia_vue/inertia/pages/account/delete.vue](../../examples/starter/inertia_vue/inertia/pages/account/delete.vue).
