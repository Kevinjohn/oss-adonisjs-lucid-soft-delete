# Maintainers

This section covers project decisions, internals, verification and release work. These pages are
kept in the repository and are not published in the user documentation site.

- [Verification](verification.md): required checks and local PostgreSQL/MySQL setup.
- [Releasing](releasing.md): the release workflow and its local gate.
- [Decisions](decisions.md): recorded design and maintenance decisions.
- [Internals](internals.md): Lucid internals used by query scoping.
- [History](history/README.md): historical implementation notes.

## Monthly

- Check each `uses:` in `.github/workflows/*.yml` for a newer release. Each is pinned to a commit
  SHA with its release tag in a trailing comment: resolve the new tag to its SHA, update both,
  and bump them in one PR.
- Check open Dependabot alerts (Security tab).
