# US-DEMO-04 — List and restore deleted accounts in the hypermedia starter

As a soft-delete administrator of the hypermedia starter app, I want to see deleted accounts and restore one so that a user who deleted their account can sign in again.

**Status:** Demo; source-reviewed in the [embedded hypermedia starter](../../examples/starter/hypermedia); the local native-auth contract fixture is retained but was not run for this documentation change.
**Access:** Authenticated account that an operator enrolled after creation by setting `users.is_soft_delete_admin` to true. Public signup cannot set the flag. A signed-in non-administrator receives `403`; a guest is redirected to `/login` by `middleware.auth()`.
**Entry:** From the signed-in dashboard, enrolled administrators follow **Deleted accounts** in the shared navigation to `GET /admin/deleted-users`, then use `POST /admin/deleted-users/:id/restore`.
**Documentation:** [Read modes](../../docs/reference/README.md#read-modes), [Instance lifecycle methods](../../docs/reference/README.md#instance-lifecycle-methods).
**Source:** [Routes](../../examples/starter/hypermedia/start/routes.ts), [DeletedUsersController](../../examples/starter/hypermedia/app/controllers/deleted_users_controller.ts), [admin check](../../examples/starter/hypermedia/app/services/soft_delete_admins.ts), [admin flag migration](../../examples/starter/hypermedia/database/migrations/1768620766696_add_soft_delete_admin_to_users.ts), [shared navigation](../../examples/starter/hypermedia/resources/views/components/layouts/app.edge), [navigation service](../../examples/starter/hypermedia/app/services/soft_delete_navigation.ts), [view helper](../../examples/starter/hypermedia/start/view.ts).
**Coverage:** [Local hypermedia native-auth contract tests](../../examples/starter/hypermedia/tests/functional/soft_delete.spec.ts), [local browser tests](../../examples/starter/hypermedia/tests/browser/soft_delete.spec.ts).

## Acceptance criteria

- The dashboard navigation shows **Deleted accounts** only when the server evaluates the signed-in account as an enrolled administrator. Both routes sit behind `middleware.auth()`; a non-administrator receives `403` before the recycle-bin query runs.
- `index` renders `pages/deleted_users` with `User.onlyTrashed()` ordered by `deleted_at` then `id`, both descending, each as `id`, `email` and an ISO-date `deletedAt`.
- `restore` finds the user with `onlyTrashed().where('id', params.id).firstOrFail()`, calls `restore()`, flashes "`<email>` is restored." and redirects to `deleted_users.index`. A valid ID for an absent or active row fails with 404. Validation rejects zero, signs, leading zeros and unsafe integer IDs before lookup.
- Page defaults to 1 and must be a positive whole number at most 1,000,000. Each page holds up to 25 rows. A valid page beyond the result set is empty. The view receives current and last page numbers.
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

**Code references:** [routes](../../examples/starter/hypermedia/start/routes.ts), [controller](../../examples/starter/hypermedia/app/controllers/deleted_users_controller.ts), [admin check](../../examples/starter/hypermedia/app/services/soft_delete_admins.ts), [admin flag migration](../../examples/starter/hypermedia/database/migrations/1768620766696_add_soft_delete_admin_to_users.ts), [operator setup](../../examples/starter/hypermedia/README.md#install-and-run), [shared navigation](../../examples/starter/hypermedia/resources/views/components/layouts/app.edge), [navigation service](../../examples/starter/hypermedia/app/services/soft_delete_navigation.ts), [view helper](../../examples/starter/hypermedia/start/view.ts), [SoftDeletes mixin](../../src/mixin.ts), [local functional tests](../../examples/starter/hypermedia/tests/functional/soft_delete.spec.ts), [local browser tests](../../examples/starter/hypermedia/tests/browser/soft_delete.spec.ts).
