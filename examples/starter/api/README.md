# Lucid Soft Delete: API starter example

This app is the official AdonisJS API starter at
[`adonisjs/starter-kits` revision `46d235932e3eb6472a16b740fa0b47b5f69fc6fc`](https://github.com/adonisjs/starter-kits/tree/46d235932e3eb6472a16b740fa0b47b5f69fc6fc/api),
with Lucid Soft Delete added. An account can delete itself; the row stays, normal queries stop
finding it, and an administrator lists deleted accounts and restores one. The
[starter examples sandbox](https://github.com/Kevinjohn/oss-adonisjs-starter-examples) combines it
with the other packages' examples.

## What this example adds

| File                                                                 | Shows                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `adonisrc.ts`                                                        | The provider, added by `node ace configure @kevinjohn/adonisjs-lucid-soft-delete`    |
| `database/migrations/1768620765696_add_deleted_at_to_users.ts`       | A nullable `deleted_at` column on `users`                                            |
| `app/models/user.ts`                                                 | `SoftDeletes` composed into the user model                                           |
| `app/services/soft_delete_admins.ts`, `start/env.ts`, `.env.example` | Administrators come from `SOFT_DELETE_ADMIN_EMAILS`; missing means nobody            |
| `app/controllers/account_deletion_controller.ts`                     | `DELETE /api/v1/account` soft deletes the signed-in account                          |
| `app/controllers/deleted_users_controller.ts`, `start/routes.ts`     | `GET /api/v1/admin/deleted-users` and `POST /api/v1/admin/deleted-users/:id/restore` |

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

Set `SOFT_DELETE_ADMIN_EMAILS` in `.env` to a comma-separated list of addresses and restart
the app. Create those accounts, and any others, through signup.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

`tests/functional/soft_delete.spec.ts` covers deleting your own account, being unable to sign in
afterwards, an administrator listing and restoring it, and a refused non-administrator and guest.
