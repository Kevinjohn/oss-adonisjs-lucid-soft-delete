# Capability coverage

The inventory covers package exports, configuration, provider setup, model and builder operations, query modes, Demo journeys in the starter and example apps (`examples/starter/api`, `examples/starter/hypermedia`, `examples/app` group recovery), guides, decision records and relevant tests. “New” means newly documented here, not new functionality.

| Story                                                                 | Action                                                                                       | Access                    | Status   | Catalogue |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------- | -------- | --------- |
| [US-DEV-01](configure-package/us-dev-01-configure-package.md)         | Configure the provider and model support                                                     | Application developer     | Operator | New       |
| [US-APP-01](soft-delete-instance/us-app-01-soft-delete-instance.md)   | Soft-delete one persisted model instance; `delete()` and `deleteQuietly()`                   | Application code          | Current  | New       |
| [US-APP-02](query-deleted-records/us-app-02-query-deleted-records.md) | Read active, all, or only deleted model rows, including relation counts/aggregates/existence | Application code          | Current  | New       |
| [US-APP-03](restore-instance/us-app-03-restore-instance.md)           | Restore a soft-deleted instance                                                              | Application code          | Current  | New       |
| [US-APP-04](purge-instance/us-app-04-purge-instance.md)               | Physically delete an active or trashed instance                                              | Application code          | Current  | New       |
| [US-APP-05](bulk-operations/us-app-05-bulk-lifecycle.md)              | Soft-delete matching rows in bulk                                                            | Application code          | Current  | New       |
| [US-APP-06](bulk-operations/us-app-06-restore-bulk.md)                | Restore matching rows in bulk                                                                | Application code          | Current  | New       |
| [US-APP-07](bulk-operations/us-app-07-purge-bulk.md)                  | Permanently remove matching rows in bulk                                                     | Application code          | Current  | New       |
| [US-DEMO-01](example-apps/us-demo-01-api-account-deletion.md)         | Authenticated user deletes own account via `DELETE /api/v1/account` (API starter)            | Authenticated user        | Demo     | New       |
| [US-DEMO-02](example-apps/us-demo-02-api-admin-restore.md)            | Administrator lists and restores deleted users via the API starter                           | Soft-delete administrator | Demo     | New       |
| [US-DEMO-03](example-apps/us-demo-03-hypermedia-account-deletion.md)  | Authenticated user deletes own account via `/account/delete` (hypermedia starter)            | Authenticated user        | Demo     | New       |
| [US-DEMO-04](example-apps/us-demo-04-hypermedia-admin-restore.md)     | Administrator lists and restores deleted users in the hypermedia starter                     | Soft-delete administrator | Demo     | New       |
| [US-DEMO-05](example-apps/us-demo-05-group-recovery.md)               | Example group recovery service: soft-delete rows as a group with `deleteGroup`               | Application code          | Demo     | New       |
| [US-DEMO-06](example-apps/us-demo-06-restore-recovery-group.md)       | Example group recovery service: restore a group once with `restoreGroup`                     | Application code          | Demo     | New       |
| [US-DEMO-07](example-apps/us-demo-07-purge-recovery-group.md)         | Example group recovery service: `invalidateGroup`, then `purgeGroup` selected rows           | Application code          | Demo     | New       |

The bulk builder stories (US-APP-05 to US-APP-07) record that `delete()` and `del()` physically delete regardless of read mode, while `softDelete()` is recoverable. Relation counts, aggregates and existence queries automatically scope the related model; arbitrary SQL subqueries require explicit predicates. Model fetch hooks do not scope raw/POJO paths or arbitrary joined tables; see the query story ([US-APP-02](query-deleted-records/us-app-02-query-deleted-records.md)) and [scope contract](../docs/reference/scope-contract.md#paths-that-bypass-model-fetch-hooks).

The `inertia_react` and `inertia_vue` starters and the `recycle_bin.ts` tutorial snippet in `examples/app` have no story; see [decision gaps](GAPS.md).
