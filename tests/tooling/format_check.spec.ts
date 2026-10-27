/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

/** Run the package's `format:check` script text in a throwaway repository with tracked files. */
async function formatCheck(
  files: Record<string, string>,
  cleanup: (fn: () => Promise<void>) => void
) {
  const root = await mkdtemp(join(tmpdir(), 'format-check-'))
  cleanup(() => rm(root, { recursive: true, force: true }))
  for (const [name, contents] of Object.entries(files)) await writeFile(join(root, name), contents)
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  const { scripts } = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
  return (remove: string[] = []) =>
    Promise.all(remove.map((name) => rm(join(root, name)))).then(() =>
      spawnSync('sh', ['-c', scripts['format:check']], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${join(projectRoot, 'node_modules/.bin')}${delimiter}${process.env.PATH}`,
        },
      })
    )
}

test.group('Format check script', () => {
  test('passes when a tracked file was deleted but not yet staged', async ({ assert, cleanup }) => {
    const run = await formatCheck({ 'a.md': '# A\n', 'b.md': '# B\n' }, cleanup)
    const result = await run(['b.md'])
    assert.equal(result.status, 0, result.stdout + result.stderr)
  })

  test('fails on an unformatted tracked file', async ({ assert, cleanup }) => {
    const run = await formatCheck({ 'a.md': '#   A\n' }, cleanup)
    const result = await run()
    assert.notEqual(result.status, 0)
    assert.include(result.stdout + result.stderr, 'a.md')
  })
})
