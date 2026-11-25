# US-DEMO-01 — Delete your own account through the API starter

As a signed-in user of the API starter app, I want to delete my account so that it stops authenticating while an administrator can still restore it.

**Status:** Demo; source-reviewed in the [embedded API starter](../../examples/starter/api); the local native-auth contract fixture is retained but was not run for this documentation change.
**Access:** Authenticated API account (`middleware.auth()`); the account deleted is always the caller's own. The local native-auth fixture covers bearer-token refusal while deleted and reuse after restoration.
**Entry:** `DELETE /api/v1/account`.
**Documentation:** [Instance lifecycle methods](../../docs/reference/README.md#instance-lifecycle-methods).
**Source:** [Routes](../../examples/starter/api/start/routes.ts), [AccountDeletionController](../../examples/starter/api/app/controllers/account_deletion_controller.ts).
**Coverage:** [Local API native-auth contract tests](../../examples/starter/api/tests/functional/soft_delete.spec.ts).

## Acceptance criteria

- The route sits in the `account` group behind `middleware.auth()`; a request without valid credentials never reaches the controller.
- `destroy` loads the signed-in user with `auth.getUserOrFail()`, calls `user.delete()` and returns `204 No Content`; the request takes no input fields.
- The row stays with `deletedAt` set. Ordinary `User` queries no longer find it, so the same issued bearer token authenticates before deletion, is refused while deleted, and authenticates again after [US-DEMO-02](us-demo-02-api-admin-restore.md) restores the account. Password login is refused while deleted.
- A failed write propagates as an error response; the controller does not catch it.

## User flow

```mermaid
flowchart TD
    A["Send DELETE /api/v1/account"] --> B{"Valid token?"}
    B -->|No| C["Receive auth failure"]
    B -->|Yes| D{"Soft-delete succeeds?"}
    D -->|No| E["Receive error"]
    D -->|Yes| F["Receive 204; later token and login attempts fail while deleted"]
```

## Code flow

Scope: starter route through the package's instance `delete()`; token issuing and the selected auth guard are AdonisJS behavior. The bearer-token sequence below is covered by the local native-auth contract fixture.

```mermaid
flowchart TD
    A["DELETE /api/v1/account"] --> B{"middleware.auth accepts token?"}
    B -->|No| C["Auth failure"]
    B -->|Yes| D["AccountDeletionController.destroy: auth.getUserOrFail"] --> E["user.delete"]
    E -->|Failure| F["Propagate error"]
    E -->|Success| G["response.noContent"]
```

**Code references:** [routes](../../examples/starter/api/start/routes.ts), [controller](../../examples/starter/api/app/controllers/account_deletion_controller.ts), [withSoftDeletes mixin](../../src/mixin.ts), [local API native-auth contract tests](../../examples/starter/api/tests/functional/soft_delete.spec.ts).
