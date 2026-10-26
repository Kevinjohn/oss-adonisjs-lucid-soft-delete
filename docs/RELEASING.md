# Manual release: 3.0.0-alpha.1

Only the repository owner publishes this package or creates the release tag. Do not run these commands until WP7 is merged and the SQLite and PostgreSQL CI legs, minimum peers, latest peers, and both installed-package consumer runs are green. Confirm the package version is `3.0.0-alpha.1`, replace `YYYY-MM-DD` in `CHANGELOG.md` with the release date, merge that change to `main` through a pull request, and publish from an up-to-date `main` checkout. A tag pushed from an unmerged commit leaves `main` without the dated entry.

Inspect the package contents before publishing: `pnpm pack` and `tar -tzf` must show `LICENSE.md`, `README.md`, `CHANGELOG.md`, and `build/**`, with no `tests/` or `examples/`. Run the checks on Node.js 24 with pnpm 11. Review the dry-run file list and metadata before the live command.

```bash
npm view @kevinjohn/lucid-soft-deletes        # expect 404 before first publish
npm login
pnpm test && pnpm test:consumer
pnpm publish --tag alpha --access public --dry-run
pnpm publish --tag alpha --access public
npm dist-tag ls @kevinjohn/lucid-soft-deletes # alpha -> 3.0.0-alpha.1
git tag v3.0.0-alpha.1 && git push origin v3.0.0-alpha.1
```

Verify that `alpha` resolves to `3.0.0-alpha.1`. On the package's first publish the registry may also point `latest` at it; that is expected, and the version must not be unpublished to clear it. `pnpm publish` refuses to run from a dirty tree or from a branch other than an up-to-date `main`. Then post the reviewed draft in [upstream-comment.md](upstream-comment.md) to [upstream issue 32](https://github.com/lookinlab/adonis-lucid-soft-deletes/issues/32), and replace the `TODO(owner)` in the README with a link to the posted comment. The upstream comment is not posted by this checklist automatically. After posting, move `upstream-comment.md` to `docs/history/` and add it to that folder's index.

For a later prerelease, set the next version and add a dated changelog entry. Commit the version and changelog together on a branch and merge it to `main` through a pull request, then repeat the checks, dry run, publish, dist-tag verification, and versioned tag steps with the new version:

```bash
pnpm version 3.0.0-alpha.2 --no-git-tag-version
git commit -am "chore(release): 3.0.0-alpha.2"
```

Use the `beta` dist-tag for beta releases. Reserve `latest` for the stable release. Publishing and tagging are manual owner actions; no release automation is configured for this alpha.
