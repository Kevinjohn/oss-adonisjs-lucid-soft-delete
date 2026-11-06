/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { spawnSync } from 'node:child_process'
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
