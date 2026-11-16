# Lucid Soft Delete: API starter example

This app is the official AdonisJS API starter at
[`adonisjs/starter-kits` revision `46d235932e3eb6472a16b740fa0b47b5f69fc6fc`](https://github.com/adonisjs/starter-kits/tree/46d235932e3eb6472a16b740fa0b47b5f69fc6fc/api),
with Lucid Soft Delete added. An account can delete itself; the row stays, normal queries stop
finding it, and an administrator lists deleted accounts and restores one. The
[starter examples sandbox](https://github.com/Kevinjohn/oss-adonisjs-starter-examples) combines it
with the other packages' examples.

## What this example adds

| File                                                                  | Shows                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `adonisrc.ts`                                                         | The provider, added by `node ace configure @kevinjohn/adonisjs-lucid-soft-delete`    |
| `database/migrations/1768620765696_add_deleted_at_to_users.ts`        | A nullable `deleted_at` column on `users`                                            |
| `app/models/user.ts`                                                  | `SoftDeletes` composed into the user model                                           |
| `app/services/soft_delete_admins.ts`, `app/models/user.ts`, migration | An operator grants an existing account a database flag; signup defaults to no access |
| `app/controllers/account_deletion_controller.ts`                      | `DELETE /api/v1/account` soft deletes the signed-in account                          |
| `app/controllers/deleted_users_controller.ts`, `start/routes.ts`      | `GET /api/v1/admin/deleted-users` and `POST /api/v1/admin/deleted-users/:id/restore` |

A deleted account's access tokens stop authenticating and it cannot log in, because the auth
guard and `verifyCredentials` query through the model, which leaves deleted rows out. Its tokens are
not revoked, so a restored account's earlier tokens work again.

## Install and run

Use Node 24 and pnpm. From the Lucid Soft Delete repository root:

```sh
pnpm install --frozen-lockfile
pnpm --dir examples/starter/api kit:pack
cd examples/starter/api
pnpm install --no-frozen-lockfile
cp .env.example .env
node ace generate:key
node ace migration:run
pnpm dev
```

`kit:pack` builds Lucid Soft Delete from this checkout into `vendor/`. The packed archive's
checksum changes with every build, so the install does not use a frozen lockfile.

Create and verify the administrator account first. As a trusted database operator, grant it by
setting `users.is_soft_delete_admin = true` for its existing numeric `id`. For example, with the default SQLite connection, after confirming the selected ID belongs to the intended account:

```sql
UPDATE users SET is_soft_delete_admin = true WHERE id = 123;
```

Set the flag to `false` to revoke access. New accounts default to `false`; public signup cannot
set this flag, even if a request includes `isSoftDeleteAdmin`. The retired
`SOFT_DELETE_ADMIN_EMAILS` setting is ignored and should be removed from existing `.env` files.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

`tests/functional/soft_delete.spec.ts` covers deleting your own account, refusal of the same
bearer token while deleted and its reactivation after restore, an administrator listing and
restoring an account, and refused non-administrators and guests.
