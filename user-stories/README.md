# User story catalogue

Application developer journeys for adding recoverable deletion to Lucid models and selecting active or deleted records.

The catalogue records source-reviewed API availability; “Current” does not claim that a runtime journey was tested.

## Index

| Story                                                                                                         | Action                                        | Access                                          | Status   |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- | -------- |
| [US-DEV-01 — Configure the provider and model support](configure-package/us-dev-01-configure-package.md)      | Configure the provider and model support      | Application developer                           | Operator |
| [US-APP-01 — Soft-delete a model instance](soft-delete-instance/us-app-01-soft-delete-instance.md)            | Soft-delete a model instance                  | Application service using a `SoftDeletes` model | Current  |
| [US-APP-02 — Select active, all, or deleted models](query-deleted-records/us-app-02-query-deleted-records.md) | Select active, all, or deleted models         | Application developer                           | Current  |
| [US-APP-03 — Restore a soft-deleted model](restore-instance/us-app-03-restore-instance.md)                    | Restore a soft-deleted model                  | Application service using a `SoftDeletes` model | Current  |
| [US-APP-04 — Permanently remove an active or trashed model](purge-instance/us-app-04-purge-instance.md)       | Permanently remove an active or trashed model | Application service using a `SoftDeletes` model | Current  |
| [US-APP-05 — Soft-delete matching rows in bulk](bulk-operations/us-app-05-bulk-lifecycle.md)                  | Soft-delete matching rows in bulk             | Application code                                | Current  |
| [US-APP-06 — Restore matching rows in bulk](bulk-operations/us-app-06-restore-bulk.md)                        | Restore matching rows in bulk                 | Application code                                | Current  |
| [US-APP-07 — Permanently remove matching rows in bulk](bulk-operations/us-app-07-purge-bulk.md)               | Permanently remove matching rows in bulk      | Application code                                | Current  |

## Catalogue records

- [Portable story template](TEMPLATE.md)
- [Reference and source map](REFERENCE.md)
- [Capability coverage](COVERAGE.md)
- [Decision gaps](GAPS.md)
