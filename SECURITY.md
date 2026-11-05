# Security policy

## Supported versions

Only the latest 0.x release receives security fixes. Upgrade to the latest release to receive them.

## Reporting a vulnerability

Report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/security/advisories/new)
or by email to [cve@kevinjohngallagher.com](mailto:cve@kevinjohngallagher.com). Never open a public
issue for a vulnerability.

Include the affected package version, model and query shape, and the observed and expected rows. Do
not include production data or credentials.

## Verifying a release

The release notes carry a SHA-256 of the archive. It detects a corrupted download; the notes and the archive are published together, so it does not prove who built the archive. Check a downloaded archive against it:

```sh
shasum -a 256 <tarball>.tgz
```

## Security model

This package runs inside the application's database connection and adds no network, file or
credential handling of its own. Its security-sensitive boundary is which rows a query reads or
changes. The application remains responsible for authorization, tenant filters, retention and
access to any raw or joined queries outside the model scopes. See the [scope contract](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/blob/main/docs/reference/scope-contract.md)
for the query paths that receive the soft-delete filter and those that do not.

## Independent review

None yet.
