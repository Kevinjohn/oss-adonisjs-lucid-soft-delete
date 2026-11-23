# Decision gaps

The accepted implementation and compatibility decisions are recorded in [maintainer decisions](../docs/maintainers/decisions.md). Public lifecycle behavior is described in the [API reference](../docs/reference/README.md); read boundaries and query paths that bypass model hooks are detailed in the [scope contract](../docs/reference/scope-contract.md), especially [paths that bypass model fetch hooks](../docs/reference/scope-contract.md#paths-that-bypass-model-fetch-hooks).

No source-backed mismatch between those accepted records and current package behavior was identified in this catalogue pass. The package does not prescribe an end-user interface, application authorization, tenant isolation, retention or cascade rules; applications supply those policies as described in the [scope contract](../docs/reference/scope-contract.md#model-fetches-and-builder-lifecycle).

The four embedded starters each expose account deletion, a paginated deleted-account list and single-account restoration. API responses, Edge views and Inertia pages have their own source and coverage links. The [recycle-bin tutorial](../examples/app/app/services/recycle_bin.ts) composes the query and instance operations, selecting only trashed rows before purge.
