/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

// `pnpm test:built-exports` passes spec names through `--files`; a renamed spec must fail the
// gate rather than let it pass green having checked nothing.
test('the test runner fails when its filters select no tests', ({ assert }) => {
  const result = spawnSync(
    process.execPath,
    ['--import=@poppinss/ts-exec', 'bin/test.ts', '--files=no_such_file.spec.ts'],
    { cwd: repoRoot, encoding: 'utf8' }
  )
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.include(result.stderr, 'No tests executed')
}).timeout(30_000)

test('the test runner distinguishes skipped and todo selections from expected failures', async ({
  assert,
  cleanup,
}) => {
  const directory = await mkdtemp(join(repoRoot, 'tests/tooling/runner-probe-'))
  cleanup(() => rm(directory, { recursive: true, force: true }))
  const fixture = join(directory, 'runner-probe.spec.ts')
  await writeFile(
    fixture,
    [
      "import { test } from '@japa/runner'",
      "test('skipped probe', () => {}).skip()",
      "test('todo probe')",
      "test('expected failure probe', () => { throw new Error('expected') }).fails()",
    ].join('\n')
  )

  for (const [title, status, summary] of [
    ['skipped probe', 1, '1 skipped'],
    ['todo probe', 1, '1 todo'],
    ['expected failure probe', 0, '1 regression'],
  ] as const) {
    const result = spawnSync(
      process.execPath,
      [
        '--import=@poppinss/ts-exec',
        'bin/test.ts',
        `--files=${relative(repoRoot, fixture)}`,
        `--tests=${title}`,
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    )
    const output = result.stdout + result.stderr
    assert.equal(result.status, status, output)
    assert.include(output, summary)
    assert.equal(result.stderr.includes('No tests executed'), status === 1, output)
  }
}).timeout(30_000)
