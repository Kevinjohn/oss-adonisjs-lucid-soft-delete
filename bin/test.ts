import { assert } from '@japa/assert'
import { expectTypeOf } from '@japa/expect-type'
import { processCLIArgs, configure, run } from '@japa/runner'

processCLIArgs(process.argv.slice(2))
configure({
  plugins: [assert(), expectTypeOf()],
  suites: [
    {
      name: 'unit',
      files: ['tests/unit/**/*.spec.ts'],
    },
    {
      name: 'tooling',
      files: ['tests/tooling/**/*.spec.ts'],
    },
  ],
})

run()
