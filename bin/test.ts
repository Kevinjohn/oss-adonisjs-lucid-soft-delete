import { assert } from '@japa/assert'
import { expectTypeOf } from '@japa/expect-type'
import { fileSystem } from '@japa/file-system'
import { processCLIArgs, configure, run } from '@japa/runner'

processCLIArgs(process.argv.slice(2))
configure({
  files: ['tests/**/*.spec.ts'],
  plugins: [assert(), expectTypeOf(), fileSystem()],
  timeout: 10_000,
  // Skipped tests and TODOs never exercise the selected behavior.
  teardown: [
    (runner) => {
      const { passed, failed, regression } = runner.getSummary().aggregates
      if (passed + failed + regression > 0) return
      console.error('No tests executed: check the --files, --tests and --groups filters')
      process.exitCode = 1
    },
  ],
})

run()
