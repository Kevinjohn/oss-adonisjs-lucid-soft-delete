# User story catalogue

Application developer journeys for adding recoverable deletion to Lucid models and selecting active or deleted records, plus Demo journeys in the example apps.

The catalogue records source-reviewed API availability; “Current” does not claim that a runtime journey was tested.

Source baseline: `origin/main` at [`c5e2aedd3743f5b281cf933eea892cc7cfa6e7e2`](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/commit/c5e2aedd3743f5b281cf933eea892cc7cfa6e7e2).

## Index

| Story                                                                                                                           | Action                                                        | Access                    | Status   |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------- | -------- |
| [US-DEV-01 — Configure the provider and model support](configure-package/us-dev-01-configure-package.md)                        | Configure the provider and model support                      | Application developer     | Operator |
| [US-APP-01 — Soft-delete a model instance](soft-delete-instance/us-app-01-soft-delete-instance.md)                              | Soft-delete a model instance                                  | Application code          | Current  |
| [US-APP-02 — Select active, all, or deleted models](query-deleted-records/us-app-02-query-deleted-records.md)                   | Select active, all, or deleted models                         | Application code          | Current  |
| [US-APP-03 — Restore a soft-deleted model](restore-instance/us-app-03-restore-instance.md)                                      | Restore a soft-deleted model                                  | Application code          | Current  |
| [US-APP-04 — Permanently remove an active or trashed model](purge-instance/us-app-04-purge-instance.md)                         | Permanently remove an active or trashed model                 | Application code          | Current  |
| [US-APP-05 — Soft-delete matching rows in bulk](bulk-operations/us-app-05-bulk-lifecycle.md)                                    | Soft-delete matching rows in bulk                             | Application code          | Current  |
| [US-APP-06 — Restore matching rows in bulk](bulk-operations/us-app-06-restore-bulk.md)                                          | Restore matching rows in bulk                                 | Application code          | Current  |
| [US-APP-07 — Permanently remove matching rows in bulk](bulk-operations/us-app-07-purge-bulk.md)                                 | Permanently remove matching rows in bulk                      | Application code          | Current  |
| [US-DEMO-01 — Delete your own account through the API starter](example-apps/us-demo-01-api-account-deletion.md)                 | Delete your own account through the API starter               | Authenticated user        | Demo     |
| [US-DEMO-02 — List and restore deleted accounts through the API starter](example-apps/us-demo-02-api-admin-restore.md)          | List and restore deleted accounts through the API starter     | Soft-delete administrator | Demo     |
| [US-DEMO-03 — Delete your own account through the hypermedia starter](example-apps/us-demo-03-hypermedia-account-deletion.md)   | Delete your own account through the hypermedia starter        | Authenticated user        | Demo     |
| [US-DEMO-04 — List and restore deleted accounts in the hypermedia starter](example-apps/us-demo-04-hypermedia-admin-restore.md) | List and restore deleted accounts in the hypermedia starter   | Soft-delete administrator | Demo     |
| [US-DEMO-05 — Delete, restore and purge a recovery group in the example app](example-apps/us-demo-05-group-recovery.md)         | Delete, restore and purge a recovery group in the example app | Application code          | Demo     |

## Catalogue records

- [Portable story template](TEMPLATE.md)
- [Reference and source map](REFERENCE.md)
- [Capability coverage](COVERAGE.md)
- [Decision gaps](GAPS.md)
