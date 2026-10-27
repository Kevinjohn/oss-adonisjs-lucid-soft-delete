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
const DOCS_CHECK_SPEC = 'tests/tooling/docs_check.spec.ts'
/** The consumer gate, its fixture, and every source/configuration input it packs. */
const CONSUMER =
  /^(scripts|examples\/app|src|providers)\/|^(index|configure)\.ts$|^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json)$/

/** Map changed files to the checks they can affect. */
export function planChecks(changes: Change[]): Plan {
  const plan: Plan = { lint: [], typecheck: false, tests: [], consumer: false }
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
    else if (/^bin\/check_changed/.test(path)) tests.add(PLAN_SPEC)
    else if (/^bin\/docs_check/.test(path)) tests.add(DOCS_CHECK_SPEC)
  }

  plan.lint = lintAll ? 'all' : [...lint].sort()
  plan.tests = testAll ? 'all' : [...tests].sort()
  return plan
}

export type TestOutcome = { passed: boolean; executed: number }

/**
 * Read Japa's summary. A run given explicit files that executes no test fails, because the
 * file filter is wrong.
 */
export function readTestOutcome(output: string, exitCode: number, explicit: boolean): TestOutcome {
  // eslint-disable-next-line no-control-regex
  const summary = output.replace(/\x1b\[[0-9;]*m/g, '').match(/Tests\s+([^\n]*)\(\d+\)/)?.[1] ?? ''
  const count = (label: string) => Number(summary.match(new RegExp(`(\\d+) ${label}`))?.[1] ?? 0)
  const executed = count('passed') + count('failed')
  return { passed: exitCode === 0 && !(explicit && executed === 0), executed }
}
