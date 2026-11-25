# Native authentication test fixtures

For runnable examples and shared recipes, use the [four Starter Examples apps](https://github.com/Kevinjohn/oss-adonisjs-starter-examples/tree/v0.17.0/apps) and their [cookbook](https://github.com/Kevinjohn/oss-adonisjs-starter-examples/tree/v0.17.0/docs/cookbook).

These four hosts exercise the locally packed Soft Delete package with native authentication.
Each checks that public signup cannot grant administrator access and that withdrawing an
administrator grant takes effect on later requests. The API also checks the same bearer token
before deletion, during deletion and after restoration. The examples workflow tests those contracts.

All four fixtures validate the restore route parameter, check that malformed and missing
identifiers do not change accounts, project only the recycle-bin display fields and order by
deletion time then ID. The lists use a validated `page` query parameter and return at most 25
accounts per page, leaving the restore routes unchanged. The API returns the starter kit's
`{ data, metadata }` paginated shape; browser fixtures display page navigation and retain their restore redirects.
