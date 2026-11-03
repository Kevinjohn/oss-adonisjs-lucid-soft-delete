# Maintainers

This section covers project decisions, internals, verification and release work. These pages are
kept in the repository and are not published in the user documentation site.

- [Verification](verification.md): required checks and local PostgreSQL/MySQL setup.
- [Releasing](releasing.md): manual release process.
- [Decisions](decisions.md): recorded design and maintenance decisions.
- [Internals](internals.md): Lucid internals used by query scoping.
- [History](history/README.md): historical implementation notes.

## Monthly

- Check each `uses:` in `.github/workflows/*.yml` for a newer release that matches its pin
  format (major tag such as `actions/checkout@v7`, or exact version such as
  `ossf/scorecard-action@v2.5.0`). Bump them in one PR.
- Check open Dependabot alerts (Security tab).
