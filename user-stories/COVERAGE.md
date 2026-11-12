# Capability coverage

The inventory covers package exports, configuration, provider setup, model and builder operations, query modes, example integration, guides, decision records and relevant tests. “New” means newly documented here, not new functionality.

| Story                                                                 | Action                                                                     | Access                | Status   | Catalogue |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------- | -------- | --------- |
| [US-DEV-01](configure-package/us-dev-01-configure-package.md)         | Configure the provider and model support                                   | Application developer | Operator | New       |
| [US-APP-01](soft-delete-instance/us-app-01-soft-delete-instance.md)   | Soft-delete one persisted model instance; `delete()` and `deleteQuietly()` | Application code      | Current  | New       |
| [US-APP-02](query-deleted-records/us-app-02-query-deleted-records.md) | Read active, all, or only deleted model rows                               | Application code      | Current  | New       |
| [US-APP-03](restore-instance/us-app-03-restore-instance.md)           | Restore a soft-deleted instance                                            | Application code      | Current  | New       |
| [US-APP-04](purge-instance/us-app-04-purge-instance.md)               | Physically delete an active or trashed instance                            | Application code      | Current  | New       |
| [US-APP-05](bulk-operations/us-app-05-bulk-lifecycle.md)              | Soft-delete matching rows in bulk                                          | Application code      | Current  | New       |
| [US-APP-06](bulk-operations/us-app-06-restore-bulk.md)                | Restore matching rows in bulk                                              | Application code      | Current  | New       |
| [US-APP-07](bulk-operations/us-app-07-purge-bulk.md)                  | Permanently remove matching rows in bulk                                   | Application code      | Current  | New       |

The builder story records that `delete()` and `del()` physically delete regardless of read mode, while `softDelete()` is recoverable. Model fetch hooks do not scope raw/POJO paths or arbitrary joined tables; see the query story and [scope contract](../docs/reference/scope-contract.md#paths-that-bypass-model-fetch-hooks).
