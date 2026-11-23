# US-DEMO-10 — Restore a deleted account in React and Vue

As a soft-delete administrator, I want to recover an account so its member can sign in again.

**Status:** Demo, source-reviewed.
**Access:** A signed-in account enrolled by an operator through `is_soft_delete_admin`; signup cannot grant this flag.
**Entry:** In the [Deleted accounts](us-demo-09-inertia-list.md) list, choose **Restore <email>** to post to `/admin/deleted-users/:id/restore`. The button uses the row ID, with no user-entered fields.
**Documentation:** [Package reference](../../docs/reference/README.md).
**Source:** [examples/starter/inertia_react/start/routes.ts](../../examples/starter/inertia_react/start/routes.ts), [examples/starter/inertia_react/app/controllers/deleted_users_controller.ts](../../examples/starter/inertia_react/app/controllers/deleted_users_controller.ts), [examples/starter/inertia_react/inertia/pages/deleted_users.tsx](../../examples/starter/inertia_react/inertia/pages/deleted_users.tsx), [examples/starter/inertia_react/app/validators/deleted_user.ts](../../examples/starter/inertia_react/app/validators/deleted_user.ts), [examples/starter/inertia_vue/start/routes.ts](../../examples/starter/inertia_vue/start/routes.ts), [examples/starter/inertia_vue/app/controllers/deleted_users_controller.ts](../../examples/starter/inertia_vue/app/controllers/deleted_users_controller.ts), [examples/starter/inertia_vue/inertia/pages/deleted_users.vue](../../examples/starter/inertia_vue/inertia/pages/deleted_users.vue), [examples/starter/inertia_vue/app/validators/deleted_user.ts](../../examples/starter/inertia_vue/app/validators/deleted_user.ts).
**Coverage:** [examples/starter/inertia_react/tests/functional/soft_delete.spec.ts](../../examples/starter/inertia_react/tests/functional/soft_delete.spec.ts), [examples/starter/inertia_vue/tests/functional/soft_delete.spec.ts](../../examples/starter/inertia_vue/tests/functional/soft_delete.spec.ts).

## Acceptance criteria

- Check the administrator flag before validating the identifier. Revoked administrators receive 403.
- The ID must be a positive decimal without leading zeros, at most 2,147,483,647 (the PostgreSQL `increments` range). An active or absent account fails lookup with 404; invalid input is rejected before lookup.
- Success clears deletedAt, flashes a message containing the email and redirects to the deleted-users index.

## User flow

```mermaid
flowchart TD
    A["Choose Restore for the selected account"] --> B{"Signed in and administrator?"}
    B -->|No| C["Redirect to login or 403"]
    B -->|Yes| D{"ID valid?"}
    D -->|No| E["Receive validation failure"]
    D -->|Yes| F{"Deleted account exists?"}
    F -->|No| G["Receive 404"]
    F -->|Yes| H{"Restore succeeds?"}
    H -->|No| I["Receive error"]
    H -->|Yes| J["Return to list with success message"]
```

## Code flow

```mermaid
flowchart TD
    A["Request restore"] --> B{"Authenticated?"}
    B -->|No| C["Redirect to login"]
    B -->|Yes| D{"isSoftDeleteAdmin?"}
    D -->|No| E["403 Forbidden"]
    D -->|Yes| F{"Valid ID?"}
    F -->|Yes| Q["onlyTrashed by ID firstOrFail"]
    F -->|No| V["Validation failure"]
    Q -->|Missing or active| N["404 Not Found"]
    Q -->|Found| T["user.restore"]
    T -->|Failure| X["Propagate error"]
    T -->|Success| Z["Flash success and redirect to deleted_users.index"]
```

**Code references:** [examples/starter/inertia_react/start/routes.ts](../../examples/starter/inertia_react/start/routes.ts), [examples/starter/inertia_react/app/controllers/deleted_users_controller.ts](../../examples/starter/inertia_react/app/controllers/deleted_users_controller.ts), [examples/starter/inertia_react/inertia/pages/deleted_users.tsx](../../examples/starter/inertia_react/inertia/pages/deleted_users.tsx), [examples/starter/inertia_react/app/validators/deleted_user.ts](../../examples/starter/inertia_react/app/validators/deleted_user.ts), [examples/starter/inertia_vue/start/routes.ts](../../examples/starter/inertia_vue/start/routes.ts), [examples/starter/inertia_vue/app/controllers/deleted_users_controller.ts](../../examples/starter/inertia_vue/app/controllers/deleted_users_controller.ts), [examples/starter/inertia_vue/inertia/pages/deleted_users.vue](../../examples/starter/inertia_vue/inertia/pages/deleted_users.vue), [examples/starter/inertia_vue/app/validators/deleted_user.ts](../../examples/starter/inertia_vue/app/validators/deleted_user.ts).
