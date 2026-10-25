# Changelog

All notable changes to this project are documented here.

## Unreleased

### Changed

- Continue from upstream `adonis-lucid-soft-deletes` tag `v2.1.0` (`71d21fb5f16f47e9c77386e58b47ca428d04c050`) and master (`83c08d6be8828bf0d7e97a4ac91d9458f4177d2a`). The complete upstream history is retained.
- Rename the package to `@kevinjohn/lucid-soft-deletes` for AdonisJS 7, Lucid 22, and Node 24.
- Replace the exception import for the current AdonisJS core export. Credit to necessarylion ([upstream PR 33](https://github.com/lookinlab/adonis-lucid-soft-deletes/pull/33)) and abdulmatinsanni ([upstream PR 34](https://github.com/lookinlab/adonis-lucid-soft-deletes/pull/34)) for identifying the compatibility fix.
- Refresh the test and build toolchain for the supported framework versions.
- Define the query scope contract for model reads, relations, aliases, clones, pagination, and documented bypass operations.
- Preserve soft-delete mode across cloned model and relation builders, and group user OR predicates before applying the default or only-trashed filter.
- Document that has-many-through scopes the related target but not its joined intermediate model; provide an explicit `onQuery` recipe for scoped relation counts.
