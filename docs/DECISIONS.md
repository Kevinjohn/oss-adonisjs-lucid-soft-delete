# Decision log

This log records implementation decisions made while delivering version 3.0.0-alpha.1. The PRD defines the product contract; an entry here records how that contract was carried out or why evidence required a change.

## 2026-10-25: Preserve upstream history with a merge commit

- **Decision:** Import `lookinlab/adonis-lucid-soft-deletes` master at `83c08d6` with an unrelated-history merge commit, retaining its full ancestry and licence text.
- **Reason:** The PRD requires provenance in Git history and both copyright notices in the distributed licence.
- **Evidence:** WP0 ancestry, commit-count, licence, and ignore checks.

## 2026-10-25: Retain the existing private-plan ignore rule

- **Decision:** Carry the checkout's pre-existing `__*.md` ignore edit into the merged `.gitignore`, along with both repositories' other ignore rules.
- **Reason:** The PRD and the checkout both require private planning files to remain uncommitted.
- **Evidence:** WP0 ignore check and `git status` after the merge.
