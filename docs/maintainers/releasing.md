# Releasing

Use `Added`, `Changed`, `Fixed` and `Removed` sections as applicable for new entries, with
breaking changes identified explicitly under `Changed`. Preserve published release wording;
apply this format prospectively rather than rewriting history for style.

1. On a branch, bump `version` in `package.json` and turn `## Unreleased` into
   `## <version> - <YYYY-MM-DD>` (add a new empty `## Unreleased` above it).
2. In the same branch, replace the previous version in the install commands in `README.md` and
   `README-AGENTS.md`, the release tag in `docs/guide/getting-started.md` and the version named in
   `docs/reference/README.md`.
3. Merge the PR.
4. Actions → release → Run workflow (on `main`).

Nothing else is manual. The release is a GitHub prerelease with the tarball attached; its notes
carry the install command and the SHA-256. `bash bin/release_check.sh` runs the same gate locally.

The workflow refuses other branches, then runs `checks` and `compat`. A `package` job with the
default read-only token runs the gate, builds, packs and uploads `tmp/release/` as an artifact.
A separate `release` job is the only one with `contents: write`; it checks out nothing, installs
nothing, downloads that artifact and runs `gh release create`, so no install or build script ever
holds a token that can publish.
