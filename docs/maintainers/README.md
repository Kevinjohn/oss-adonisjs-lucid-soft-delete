# Maintainers

## Monthly

- Check each `uses:` in `.github/workflows/*.yml` for a newer release that matches its pin
  format (major tag such as `actions/checkout@v7`, or exact version such as
  `ossf/scorecard-action@v2.5.0`). Bump them in one PR.
- Check open Dependabot alerts (Security tab).
