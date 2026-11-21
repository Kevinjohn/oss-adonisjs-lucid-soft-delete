# US-DEMO-10 — Restore a deleted account in React and Vue

As a soft-delete administrator, I want to recover an account so its member can sign in again.

**Status:** Demo, source-reviewed.
**Access:** A soft-delete administrator.
**Entry:** POST /admin/deleted-users/:id/restore.
**Documentation:** [Package reference](../../docs/reference/README.md).
**Source:** [examples/starter/inertia_react/start/routes.ts](../../examples/starter/inertia_react/start/routes.ts), [examples/starter/inertia_react/app/controllers/deleted_users_controller.ts](../../examples/starter/inertia_react/app/controllers/deleted_users_controller.ts), [examples/starter/inertia_react/inertia/pages/deleted_users.tsx](../../examples/starter/inertia_react/inertia/pages/deleted_users.tsx), [examples/starter/inertia_react/app/validators/deleted_user.ts](../../examples/starter/inertia_react/app/validators/deleted_user.ts), [examples/starter/inertia_vue/start/routes.ts](../../examples/starter/inertia_vue/start/routes.ts), [examples/starter/inertia_vue/app/controllers/deleted_users_controller.ts](../../examples/starter/inertia_vue/app/controllers/deleted_users_controller.ts), [examples/starter/inertia_vue/inertia/pages/deleted_users.vue](../../examples/starter/inertia_vue/inertia/pages/deleted_users.vue), [examples/starter/inertia_vue/app/validators/deleted_user.ts](../../examples/starter/inertia_vue/app/validators/deleted_user.ts).
**Coverage:** [examples/starter/inertia_react/tests/functional/soft_delete.spec.ts](../../examples/starter/inertia_react/tests/functional/soft_delete.spec.ts), [examples/starter/inertia_vue/tests/functional/soft_delete.spec.ts](../../examples/starter/inertia_vue/tests/functional/soft_delete.spec.ts).

## Acceptance criteria

- Check the administrator flag before validating the identifier. Revoked administrators receive 403.
- The ID must be a positive decimal without leading zeros, at most 16 digits and within the safe integer range. An active or absent account fails lookup.
- Success clears deletedAt, flashes a message containing the email and redirects to the deleted-users index.

## User flow

```mermaid
flowchart TD
    A["Choose deleted account"] --> B["Submit restoration"] --> C["Return to list"]
```

## Code flow

```mermaid
flowchart TD
    A["Check grant"] --> B["Validate ID"] --> C["Find only trashed account"] --> D["Restore and redirect"]
```

**Code references:** [examples/starter/inertia_react/start/routes.ts](../../examples/starter/inertia_react/start/routes.ts), [examples/starter/inertia_react/app/controllers/deleted_users_controller.ts](../../examples/starter/inertia_react/app/controllers/deleted_users_controller.ts), [examples/starter/inertia_react/inertia/pages/deleted_users.tsx](../../examples/starter/inertia_react/inertia/pages/deleted_users.tsx), [examples/starter/inertia_react/app/validators/deleted_user.ts](../../examples/starter/inertia_react/app/validators/deleted_user.ts), [examples/starter/inertia_vue/start/routes.ts](../../examples/starter/inertia_vue/start/routes.ts), [examples/starter/inertia_vue/app/controllers/deleted_users_controller.ts](../../examples/starter/inertia_vue/app/controllers/deleted_users_controller.ts), [examples/starter/inertia_vue/inertia/pages/deleted_users.vue](../../examples/starter/inertia_vue/inertia/pages/deleted_users.vue), [examples/starter/inertia_vue/app/validators/deleted_user.ts](../../examples/starter/inertia_vue/app/validators/deleted_user.ts).
