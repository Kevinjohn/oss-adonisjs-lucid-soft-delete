# Native authentication test fixtures

For runnable examples and shared recipes, use the [four Starter Examples apps](https://github.com/Kevinjohn/oss-adonisjs-starter-examples/tree/v0.13.0/apps) and their [cookbook](https://github.com/Kevinjohn/oss-adonisjs-starter-examples/tree/v0.13.0/docs/cookbook).

These four hosts exercise the locally packed Soft Delete package with native authentication.
Each checks that public signup cannot grant administrator access and that withdrawing an
administrator grant takes effect on later requests. The API also checks the same bearer token
before deletion, during deletion and after restoration. The examples workflow tests those contracts.
