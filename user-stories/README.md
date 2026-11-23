# User story catalogue

Application developer journeys for adding recoverable deletion to Lucid models and selecting active or deleted records, plus Demo journeys in the example apps.

The catalogue records source-reviewed API availability; “Current” does not claim that a runtime journey was tested.

Source baseline: `origin/main` at [`9e54ec83fc34175c30bcf963887289c90332759a`](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/commit/9e54ec83fc34175c30bcf963887289c90332759a). The catalogue was reconciled against the public package and embedded starter source at that commit.

## Index

| Story                                                                                                                         | Action                                                   | Access                    | Status   |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------- | -------- |
| [US-DEV-01 — Configure the provider and model support](configure-package/us-dev-01-configure-package.md)                      | Configure the provider and model support                 | Application developer     | Operator |
| [US-APP-01 — Soft-delete a model instance](soft-delete-instance/us-app-01-soft-delete-instance.md)                            | Soft-delete a model instance                             | Application code          | Current  |
| [US-APP-02 — Select active, all, or deleted models](query-deleted-records/us-app-02-query-deleted-records.md)                 | Select active, all, or deleted models                    | Application code          | Current  |
| [US-APP-03 — Restore a soft-deleted model](restore-instance/us-app-03-restore-instance.md)                                    | Restore a soft-deleted model                             | Application code          | Current  |
| [US-APP-04 — Permanently remove an active or trashed model](purge-instance/us-app-04-purge-instance.md)                       | Permanently remove an active or trashed model            | Application code          | Current  |
| [US-APP-05 — Soft-delete matching rows in bulk](bulk-operations/us-app-05-bulk-lifecycle.md)                                  | Soft-delete matching rows in bulk                        | Application code          | Current  |
| [US-APP-06 — Restore matching rows in bulk](bulk-operations/us-app-06-restore-bulk.md)                                        | Restore matching rows in bulk                            | Application code          | Current  |
| [US-APP-07 — Permanently remove matching rows in bulk](bulk-operations/us-app-07-purge-bulk.md)                               | Permanently remove matching rows in bulk                 | Application code          | Current  |
| [US-DEMO-01 — Delete your own account through the API starter](example-apps/us-demo-01-api-account-deletion.md)               | Delete your own account through the API starter          | Authenticated user        | Demo     |
| [US-DEMO-02 — Restore a deleted account in the api starter](example-apps/us-demo-02-api-admin-restore.md)                     | Restore a deleted account in the api starter             | Soft-delete administrator | Demo     |
| [US-DEMO-03 — Delete your own account through the hypermedia starter](example-apps/us-demo-03-hypermedia-account-deletion.md) | Delete your own account through the hypermedia starter   | Authenticated user        | Demo     |
| [US-DEMO-04 — Restore a deleted account in the hypermedia starter](example-apps/us-demo-04-hypermedia-admin-restore.md)       | Restore a deleted account in the hypermedia starter      | Soft-delete administrator | Demo     |
| [US-DEMO-05 — Soft-delete rows as a recovery group in the example app](example-apps/us-demo-05-group-recovery.md)             | Soft-delete rows as a recovery group in the example app  | Application code          | Demo     |
| [US-DEMO-06 — Restore a recovery group in the example app](example-apps/us-demo-06-restore-recovery-group.md)                 | Restore a recovery group in the example app              | Application code          | Demo     |
| [US-DEMO-07 — Invalidate and purge a recovery group in the example app](example-apps/us-demo-07-purge-recovery-group.md)      | Invalidate and purge a recovery group in the example app | Application code          | Demo     |
| [US-APP-08 — Detect model support](integration/us-app-08-capability.md)                                                       | Detect model support                                     | Application developer     | Current  |
| [US-APP-09 — Record the rows a bulk lifecycle write changed](integration/us-app-09-receipts.md)                               | Record the rows a bulk lifecycle write changed           | Application code          | Current  |
| [US-APP-10 — Load related records in the intended read mode](integration/us-app-10-relations.md)                              | Load related records in the intended read mode           | Application developer     | Current  |
| [US-APP-11 — Commit lifecycle changes with application bookkeeping](integration/us-app-11-transaction.md)                     | Commit lifecycle changes with application bookkeeping    | Application code          | Current  |
| [US-DEMO-08 — Delete your own account in React and Vue](example-apps/us-demo-08-inertia-delete.md)                            | Delete your own account in React and Vue                 | Authenticated user        | Demo     |
| [US-DEMO-09 — Page through deleted accounts in React and Vue](example-apps/us-demo-09-inertia-list.md)                        | Page through deleted accounts in React and Vue           | Soft-delete administrator | Demo     |
| [US-DEMO-10 — Restore a deleted account in React and Vue](example-apps/us-demo-10-inertia-restore.md)                         | Restore a deleted account in React and Vue               | Soft-delete administrator | Demo     |
| [US-APP-12 — Expose deletion state in a model response](integration/us-app-12-serialisation.md)                               | Expose deletion state in a model response                | Application developer     | Current  |
| [US-DEMO-11 — List deleted accounts in the api starter](example-apps/us-demo-11-api-admin-list.md)                            | List deleted accounts in the api starter                 | Soft-delete administrator | Demo     |
| [US-DEMO-12 — List deleted accounts in the hypermedia starter](example-apps/us-demo-12-hypermedia-admin-list.md)              | List deleted accounts in the hypermedia starter          | Soft-delete administrator | Demo     |
| [US-APP-13 — Refresh an instance with its deletion state](integration/us-app-13-refresh-instance.md)                          | Refresh an instance with its deletion state              | Application code          | Current  |

## Catalogue records

- [Portable story template](TEMPLATE.md)
- [Reference and source map](REFERENCE.md)
- [Capability coverage](COVERAGE.md)
- [Decision gaps](GAPS.md)
