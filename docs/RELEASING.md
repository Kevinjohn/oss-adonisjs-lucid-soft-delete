# Manual release: 0.1.1-alpha

Only the repository owner creates the release tag and the GitHub prerelease. This release is not published to npm: the packed tarball attached to the GitHub prerelease is the install source named in the README.

Do not run these commands until the SQLite, PostgreSQL and MySQL CI legs, minimum peers, latest peers, and both installed-package consumer runs are green on `main`. Confirm the package version is `0.1.1-alpha` and the `CHANGELOG.md` entry carries the release date, both merged to `main` through a pull request. Tag from an up-to-date `main` checkout. A tag pushed from an unmerged commit leaves `main` without the dated entry.

Run the checks on Node.js 24 with pnpm 11, then pack and inspect the tarball. `tar -tzf` must show `LICENSE.md`, `README.md`, `CHANGELOG.md`, and `build/**`, with no `tests/` or `examples/`:

```bash
git switch main && git pull --ff-only
pnpm test && pnpm test:consumer && pnpm test:consumer --compatibility=minimum
pnpm pack
tar -tzf kevinjohn-lucid-soft-deletes-0.1.1-alpha.tgz
git tag v0.1.1-alpha && git push origin v0.1.1-alpha
gh release create v0.1.1-alpha kevinjohn-lucid-soft-deletes-0.1.1-alpha.tgz --prerelease --title "0.1.1-alpha" --notes "See the 0.1.1-alpha entry in CHANGELOG.md."
```

The tarball's file name must stay `kevinjohn-lucid-soft-deletes-0.1.1-alpha.tgz`: the README install command downloads it from that release URL. After publishing, run the [tutorial](tutorial.md) setup block from an empty directory; it checks out the new tag.

Then post the reviewed draft in [upstream-comment.md](upstream-comment.md) to [upstream issue 32](https://github.com/lookinlab/adonis-lucid-soft-deletes/issues/32), and replace the `TODO(owner)` in the README with a link to the posted comment. The upstream comment is not posted by this checklist automatically. After posting, move `upstream-comment.md` to `docs/history/` and add it to that folder's index.

For a later prerelease, set the next version and add a dated changelog entry. Commit the version and changelog together on a branch and merge it to `main` through a pull request. Then update the version in the README install URL, the tutorial tag and this checklist, and repeat the checks, pack, tag and release steps:

```bash
pnpm version 0.2.0-alpha --no-git-tag-version
git commit -am "chore(release): 0.2.0-alpha"
```

Publishing to npm is not part of this release; `publishConfig.tag` stays `alpha` for a later npm publication. Tagging and releasing are manual owner actions; no release automation is configured for this alpha.
