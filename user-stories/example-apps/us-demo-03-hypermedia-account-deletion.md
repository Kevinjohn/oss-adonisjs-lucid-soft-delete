# US-DEMO-03 — Delete your own account through the hypermedia starter

As a signed-in user of the hypermedia starter app, I want to confirm and delete my account so that I am signed out and cannot sign in again unless an administrator restores it.

**Status:** Demo; source-reviewed in the [embedded hypermedia starter](../../examples/starter/hypermedia); the local native-auth contract fixture is retained but was not run for this documentation change.
**Access:** Authenticated user (`middleware.auth()`); the account deleted is always the caller's own.
**Entry:** From the signed-in dashboard, follow **Delete account** in the shared navigation to the `GET /account/delete` confirmation page, then use **Delete my account** (`POST /account/delete`).
**Documentation:** [Instance lifecycle methods](../../docs/reference/README.md#instance-lifecycle-methods).
**Source:** [Routes](../../examples/starter/hypermedia/start/routes.ts), [AccountDeletionController](../../examples/starter/hypermedia/app/controllers/account_deletion_controller.ts), [confirmation view](../../examples/starter/hypermedia/resources/views/pages/account/delete.edge), [shared navigation](../../examples/starter/hypermedia/resources/views/components/layouts/app.edge).
**Coverage:** [Local hypermedia native-auth contract tests](../../examples/starter/hypermedia/tests/functional/soft_delete.spec.ts), [local browser navigation test](../../examples/starter/hypermedia/tests/browser/soft_delete.spec.ts).

## Acceptance criteria

- The signed-in dashboard navigation exposes **Delete account** to every member. The deletion form has one control, the "Delete my account" submit button, and no user-entered fields (the shared form component adds a hidden CSRF token); the shared layout adds its usual navigation, theme toggle and log-out controls. It warns that the account is hidden at once, the user is signed out and an administrator can restore it.
- `destroy` calls `user.delete()`, logs out the `web` guard and redirects to the `session.create` route.
- If logout fails after deletion, the controller propagates the error and skips the redirect. The account stays hidden.
- The row stays with `deletedAt` set; ordinary `User` queries no longer find it, so it cannot sign in. [US-DEMO-04](us-demo-04-hypermedia-admin-restore.md) restores it.
- A guest is redirected by `middleware.auth()` before either route runs. There is no separate cancel control other than leaving the page.

## User flow

```mermaid
flowchart TD
    A["Open account deletion page"] --> B{"Signed in?"}
    B -->|No| C["Redirect to login"]
    B -->|Yes| D["Read confirmation"] --> E{"Submit deletion?"}
    E -->|No| F["Leave without changing account"]
    E -->|Yes| G{"Deletion succeeds?"}
    G -->|No| H["Receive error"]
    G -->|Yes| I["Account hidden"] --> J{"Logout succeeds?"}
    J -->|No| K["Receive error with session status unconfirmed"]
    J -->|Yes| L["Session ends and login page opens"]
```

## Code flow

Scope: starter routes and controller through the package's instance `delete()`; session and form handling are AdonisJS behavior.

```mermaid
flowchart TD
    A["GET or POST /account/delete"] --> B{"Authenticated web session?"}
    B -->|No| C["Redirect to login"]
    B -->|Yes| D{"Method?"}
    D -->|GET| E["view.render pages/account/delete"]
    D -->|POST| F["auth.getUserOrFail then user.delete"]
    F -->|Failure| X["Propagate error"]
    F -->|Success| G["web.logout"]
    G -->|Failure| X
    G -->|Success| H["Redirect session.create"]
```

**Code references:** [routes](../../examples/starter/hypermedia/start/routes.ts), [controller](../../examples/starter/hypermedia/app/controllers/account_deletion_controller.ts), [view](../../examples/starter/hypermedia/resources/views/pages/account/delete.edge), [shared navigation](../../examples/starter/hypermedia/resources/views/components/layouts/app.edge), [withSoftDeletes mixin](../../src/mixin.ts), [local functional tests](../../examples/starter/hypermedia/tests/functional/soft_delete.spec.ts).
