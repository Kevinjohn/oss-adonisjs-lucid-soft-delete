# Maintainers

This section covers project decisions, internals, verification and release work. These pages are
kept in the repository and are not published in the user documentation site.

- [Verification](verification.md): required checks and local PostgreSQL/MySQL setup.
- [Releasing](releasing.md): the release workflow and its local gate.
- [Decisions](decisions.md): recorded design and maintenance decisions.
- [Internals](internals.md): Lucid internals used by query scoping.
- [History](history/README.md): historical implementation notes.

## Monthly

- Review the weekly Dependabot pull request for GitHub Actions. Every `uses:` in
  `.github/workflows/*.yml` is pinned to a commit SHA with the release tag in a trailing comment.
- Check open Dependabot alerts (Security tab).
