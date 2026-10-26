/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { planChecks, readTestOutcome } from '../../bin/check_changed_plan.js'

const changed = (...paths: string[]) => paths.map((path) => ({ path, deleted: false }))

test.group('check:changed plan', () => {
  test('a changed spec runs on its own with lint and typecheck', ({ assert }) => {
    assert.deepEqual(planChecks(changed('tests/unit/scope.spec.ts')), {
      lint: ['tests/unit/scope.spec.ts'],
      typecheck: true,
      tests: ['tests/unit/scope.spec.ts'],
      consumer: false,
    })
  })

  test('{$self} runs the full suite')
    .with([
      'src/scope.ts',
      'providers/lucid_soft_deletes_provider.ts',
      'index.ts',
      'configure.ts',
      'tests/helpers.ts',
      'tests/fixtures/models.ts',
      'tests/types/builder.ts',
      'bin/test.ts',
      'tsconfig.json',
      'package.json',
      'pnpm-lock.yaml',
    ])
    .run(({ assert }, path) => {
      assert.equal(planChecks(changed(path, 'tests/unit/scope.spec.ts')).tests, 'all')
    })

  test('{$self} lints the whole project')
    .with(['eslint.config.js', 'package.json', 'pnpm-lock.yaml'])
    .run(({ assert }, path) => {
      assert.equal(planChecks(changed(path, 'src/scope.ts')).lint, 'all')
    })

  test('docs and changelog select no checks', ({ assert }) => {
    assert.deepEqual(planChecks(changed('README.md', 'CHANGELOG.md', 'docs/upgrade.md')), {
      lint: [],
      typecheck: false,
      tests: [],
      consumer: false,
    })
  })

  test('build, tmp and coverage output is ignored', ({ assert }) => {
    const plan = planChecks(changed('build/index.js', 'tmp/x.ts', 'coverage/lcov.info'))
    assert.deepEqual(plan, { lint: [], typecheck: false, tests: [], consumer: false })
  })

  test('{$self} runs only the consumer gate')
    .with(['examples/app/tests/consumer.spec.ts', 'examples/app/start/routes.ts'])
    .run(({ assert }, path) => {
      assert.deepEqual(planChecks(changed(path)), {
        lint: [],
        typecheck: false,
        tests: [],
        consumer: true,
      })
    })

  test('package.json runs the consumer gate', ({ assert }) => {
    assert.isTrue(planChecks(changed('package.json')).consumer)
  })

  test('consumer gate files run the gate and lint', ({ assert }) => {
    const plan = planChecks(changed('scripts/consumer/harness.mjs'))
    assert.isTrue(plan.consumer)
    assert.deepEqual(plan.lint, ['scripts/consumer/harness.mjs'])
    assert.isFalse(plan.typecheck)
  })

  test('the check itself runs its own spec', ({ assert }) => {
    assert.deepEqual(planChecks(changed('bin/check_changed.ts')).tests, [
      'tests/unit/check_changed_plan.spec.ts',
    ])
  })

  test('deleted files select checks but are never passed to a tool', ({ assert }) => {
    const plan = planChecks([
      { path: 'tests/unit/old.spec.ts', deleted: true },
      { path: 'src/old.ts', deleted: true },
    ])
    assert.deepEqual(plan.lint, [])
    assert.isTrue(plan.typecheck)
    assert.equal(plan.tests, 'all')

    const specOnly = planChecks([{ path: 'tests/unit/old.spec.ts', deleted: true }])
    assert.deepEqual(specOnly.tests, [])
    assert.isTrue(specOnly.typecheck)
  })
})

test.group('check:changed test outcome', () => {
  test('counts passed and failed tests, not skipped ones', ({ assert }) => {
    const output = '\u001b[32m PASSED \u001b[39m\nTests  104 passed, 2 skipped (106)\n'
    assert.deepEqual(readTestOutcome(output, 0, false), { passed: true, executed: 104 })
    assert.deepEqual(readTestOutcome('Tests  3 passed, 1 failed (4)', 1, true), {
      passed: false,
      executed: 4,
    })
  })

  test('explicit files that run no test fail', ({ assert }) => {
    assert.deepEqual(readTestOutcome(' NO TESTS EXECUTED ', 0, true), {
      passed: false,
      executed: 0,
    })
    assert.deepEqual(readTestOutcome('Tests  0 passed, 1 skipped (1)', 0, true), {
      passed: false,
      executed: 0,
    })
  })
})
