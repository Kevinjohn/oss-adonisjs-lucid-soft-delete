/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

export type Change = { path: string; deleted: boolean }

export type Plan = {
  /** Files for ESLint, or the whole project. Empty skips the step. */
  lint: 'all' | string[]
  typecheck: boolean
  /** Spec files to run, or the full unit suite. Empty skips the step. */
  tests: 'all' | string[]
  consumer: boolean
  /** Suites selected by the change but left out by `--static`. */
  skipped: string[]
}

const IGNORED = /^(build|tmp|examples|coverage)\//
const LINTABLE = /\.(ts|mts|cts|js|mjs|cjs)$/
const TYPED = /\.(ts|mts|cts)$/
const SPEC = /^tests\/(unit|tooling)\/.+\.spec\.ts$/
const DEPENDENCIES = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])
const LINT_CONFIG = new Set(['eslint.config.js', ...DEPENDENCIES])
const TYPE_CONFIG = new Set(['tsconfig.json', ...DEPENDENCIES])
/** Package source, shared test setup and tooling config: no dependency map, so run every spec. */
const FULL_SUITE = [
  /^(src|providers|tests\/fixtures|tests\/types)\//,
  /^(index|configure)\.ts$/,
  /^tests\/helpers\.ts$/,
  /^bin\/test\.ts$/,
  /^tsconfig\.json$/,
]
const PLAN_SPEC = 'tests/tooling/check_changed_plan.spec.ts'
const RUNNER_SPEC = 'tests/tooling/check_changed_runner.spec.ts'
const DOCS_CHECK_SPEC = 'tests/tooling/docs_check.spec.ts'
/** The consumer gate, its fixture, and every source/configuration input it packs. */
const CONSUMER =
  /^(scripts|examples\/app|src|providers)\/|^(index|configure)\.ts$|^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json)$/

/**
 * Map changed files to the checks they can affect. `staticOnly` keeps changed spec files but
 * leaves out the full unit suite and the consumer gate, which a batch run covers once.
 */
export function planChecks(changes: Change[], staticOnly = false): Plan {
  const plan: Plan = { lint: [], typecheck: false, tests: [], consumer: false, skipped: [] }
  const lint = new Set<string>()
  const tests = new Set<string>()
  let lintAll = false
  let testAll = false

  for (const { path, deleted } of changes) {
    if (CONSUMER.test(path)) plan.consumer = true
    if (IGNORED.test(path)) continue

    if (LINT_CONFIG.has(path)) lintAll = true
    else if (LINTABLE.test(path) && !deleted) lint.add(path)

    if (TYPED.test(path) || TYPE_CONFIG.has(path)) plan.typecheck = true

    if (DEPENDENCIES.has(path) || FULL_SUITE.some((pattern) => pattern.test(path))) testAll = true
    else if (SPEC.test(path) && !deleted) tests.add(path)
    else if (path === 'bin/check_changed.ts') {
      tests.add(PLAN_SPEC)
      tests.add(RUNNER_SPEC)
    } else if (path === 'bin/check_changed_plan.ts') tests.add(PLAN_SPEC)
    else if (/^bin\/docs_check/.test(path)) tests.add(DOCS_CHECK_SPEC)
  }

  plan.lint = lintAll ? 'all' : [...lint].sort()
  plan.tests = testAll && !staticOnly ? 'all' : [...tests].sort()
  if (staticOnly && testAll) plan.skipped.push('unit suite')
  if (staticOnly && plan.consumer) {
    plan.consumer = false
    plan.skipped.push('consumer')
  }
  return plan
}

export type TestOutcome = { passed: boolean; executed: number }

/**
 * Read Japa's summary. A successful check must execute at least one test and report no failures.
 */
export function readTestOutcome(output: string, exitCode: number): TestOutcome {
  // eslint-disable-next-line no-control-regex
  const plainOutput = output.replace(/\x1b\[[0-9;]*m/g, '')
  const summaryLines = plainOutput.split(/\r?\n/).filter((line) => /^\s*Tests\b/.test(line))
  const summaryLine = summaryLines[0]
  const summary =
    summaryLines.length === 1 && summaryLine
      ? summaryLine.match(/^\s*Tests\s+([^\n]*)\((\d+)\)\s*$/)
      : null
  const counts = new Map<string, number>()
  let recognized = summary !== null
  if (summary) {
    for (const result of summary[1].split(', ').map((part) => part.trim())) {
      const match = result.match(/^(\d+) (passed|failed|todo|skipped|regression)$/)
      if (!match || counts.has(match[2])) {
        recognized = false
        break
      }
      counts.set(match[2], Number(match[1]))
    }
    recognized &&=
      [...counts.values()].reduce((total, count) => total + count, 0) === Number(summary[2])
  }
  const passed = counts.get('passed') ?? 0
  const failed = counts.get('failed') ?? 0
  const regressions = counts.get('regression') ?? 0
  return {
    passed: exitCode === 0 && recognized && passed > 0 && failed === 0 && regressions === 0,
    executed: passed + failed + regressions,
  }
}
