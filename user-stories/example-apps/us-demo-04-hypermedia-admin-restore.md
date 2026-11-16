# US-DEMO-04 — List and restore deleted accounts in the hypermedia starter

As a soft-delete administrator of the hypermedia starter app, I want to see deleted accounts and restore one so that a user who deleted their account can sign in again.

**Status:** Demo; source-reviewed in the hypermedia starter example only, not runtime-tested here.
**Access:** Authenticated account that an operator enrolled after creation by setting `users.is_soft_delete_admin` to true. Public signup cannot set the flag. A signed-in non-administrator receives `403`; a guest is redirected to `/login` by `middleware.auth()`.
**Entry:** From the signed-in dashboard, enrolled administrators follow **Deleted accounts** in the shared navigation to `GET /admin/deleted-users`, then use `POST /admin/deleted-users/:id/restore`.
**Documentation:** [Read modes](../../docs/reference/README.md#read-modes), [Instance lifecycle methods](../../docs/reference/README.md#instance-lifecycle-methods).
**Source:** [Routes](../../examples/starter/hypermedia/start/routes.ts) (lines 39-42), [DeletedUsersController](../../examples/starter/hypermedia/app/controllers/deleted_users_controller.ts) (lines 9, 22), [admin check](../../examples/starter/hypermedia/app/services/soft_delete_admins.ts), [admin flag migration](../../examples/starter/hypermedia/database/migrations/1768620766696_add_soft_delete_admin_to_users.ts), [shared navigation](../../examples/starter/hypermedia/resources/views/components/layouts/app.edge), [navigation service](../../examples/starter/hypermedia/app/services/soft_delete_navigation.ts), [view helper](../../examples/starter/hypermedia/start/view.ts).
**Coverage:** [Functional tests](../../examples/starter/hypermedia/tests/functional/soft_delete.spec.ts), [browser tests](../../examples/starter/hypermedia/tests/browser/soft_delete.spec.ts).

## Acceptance criteria

- The dashboard navigation shows **Deleted accounts** only when the server evaluates the signed-in account as an enrolled administrator. Both routes sit behind `middleware.auth()`; a non-administrator receives `403` before any query runs.
- `index` renders `pages/deleted_users` with `User.onlyTrashed()` ordered by `deleted_at` descending, each as `id`, `email` and an ISO-date `deletedAt`.
- `restore` finds the user with `onlyTrashed().where('id', params.id).firstOrFail()`, calls `restore()`, flashes "`<email>` is restored." and redirects to `deleted_users.index`. An id that is missing or not trashed fails as not found.
- The administrator grant comes from the account row, defaults to false for new signups, and can be revoked by clearing the flag.

## User flow

```mermaid
flowchart TD
    O["Operator enrolls a verified existing account"] --> A
    R["Operator revokes the account grant"] --> B
    A["Administrator opens the dashboard"] --> N["Follow Deleted accounts navigation"]
    N --> B{"Signed in and operator-enrolled as administrator?"}
    B -->|No| C["Redirected to sign in or receive 403"]
    B -->|Yes| D["See deleted accounts, newest deletion first"]
    D --> E["Submit restore for one account"]
    E --> F{"Account is deleted?"}
    F -->|No| G["Receive not found"]
    F -->|Yes| H["Account is restored; list shows a success message"]
```

## Code flow

Scope: starter routes and controller through `onlyTrashed()` and `restore()`; view markup is outside this flow.

```mermaid
flowchart TD
    P["Operator sets users.is_soft_delete_admin on an existing row"] --> Q["User row stores grant"]
    Q --> C
    N["layouts/app.edge uses server softDeleteNavigation for nav"] --> A
    A["router.get and router.post under admin/deleted-users"] --> B["middleware.auth"]
    B --> C["isSoftDeleteAdmin checks users.is_soft_delete_admin"]
    C -->|No| D["response.forbidden"]
    C -->|Yes| E{"Action"}
    E -->|index| F["User.onlyTrashed ordered by deleted_at desc"]
    F --> G["view.render pages/deleted_users"]
    E -->|restore| H["User.onlyTrashed where id firstOrFail"]
    H --> I["user.restore"]
    I --> J["session.flash success and redirect to deleted_users.index"]
```

**Code references:** [routes](../../examples/starter/hypermedia/start/routes.ts), [controller](../../examples/starter/hypermedia/app/controllers/deleted_users_controller.ts), [admin check](../../examples/starter/hypermedia/app/services/soft_delete_admins.ts), [admin flag migration](../../examples/starter/hypermedia/database/migrations/1768620766696_add_soft_delete_admin_to_users.ts), [operator setup](../../examples/starter/hypermedia/README.md#install-and-run), [shared navigation](../../examples/starter/hypermedia/resources/views/components/layouts/app.edge), [navigation service](../../examples/starter/hypermedia/app/services/soft_delete_navigation.ts), [view helper](../../examples/starter/hypermedia/start/view.ts), [SoftDeletes mixin](../../src/mixin.ts), [functional tests](../../examples/starter/hypermedia/tests/functional/soft_delete.spec.ts), [browser tests](../../examples/starter/hypermedia/tests/browser/soft_delete.spec.ts).
