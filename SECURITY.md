# Security

## Supported versions

This package supports the current AdonisJS major. When the next major ships, the previous line
receives fixes for six months. Only the latest release on each supported line receives fixes.

| Package line                               | AdonisJS | Status              |
| ------------------------------------------ | -------- | ------------------- |
| 3.x                                        | 7        | Supported           |
| 2.x (upstream `adonis-lucid-soft-deletes`) | 6        | Not maintained here |

## Reporting a vulnerability

Report security issues through
[GitHub issues](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/issues). Describe the
affected version, the model and query shape involved, and the observed and expected rows. Omit any
production data. There is no response-time promise.

This package runs inside the application's own database connection and adds no network, file or
credential handling of its own. The likely class of defect is a query that returns or modifies rows
it should not, such as a trashed row appearing in a scoped result. Treat such a report as a
correctness bug with a security label.
