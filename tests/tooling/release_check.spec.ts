/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'

const releaseCheck = fileURLToPath(new URL('../../bin/release_check.sh', import.meta.url))
const version = '0.0.0-wp6-test'

async function fixture(cleanup: (fn: () => Promise<void>) => void) {
  const root = await mkdtemp(join(tmpdir(), 'release-check-'))
  cleanup(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'bin'), { recursive: true })
  await mkdir(join(root, 'fake-bin'))
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'release-check-fixture', version })
  )
  await writeFile(
    join(root, 'CHANGELOG.md'),
    `# Changelog\n\n## ${version} - 2026-11-03\n\nFixture notes.\n`
  )
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Release Check Test'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'release-check@example.test'], { cwd: root })
  execFileSync('git', ['commit', '--allow-empty', '--quiet', '-m', 'initialize fixture'], {
    cwd: root,
  })
  return root
}

function runReleaseCheck(root: string) {
  return spawnSync('bash', [releaseCheck], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(root, 'fake-bin')}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'example/release-check-fixture',
      GITHUB_ENV: join(root, 'github-env'),
    },
  })
}

test.group('release check', () => {
  test('rejects a version whose tag already exists', async ({ assert, cleanup }) => {
    const root = await fixture(cleanup)
    execFileSync('git', ['tag', `v${version}`], { cwd: root })

    const result = runReleaseCheck(root)

    assert.notEqual(result.status, 0)
    assert.include(result.stderr, `tag v${version} already exists`)
  })

  test('requires a dated heading for the package version', async ({ assert, cleanup }) => {
    const root = await fixture(cleanup)
    await writeFile(join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n')

    const result = runReleaseCheck(root)

    assert.notEqual(result.status, 0)
    assert.include(result.stderr, `CHANGELOG.md has no '## ${version} - YYYY-MM-DD' heading`)
  })

  test('packs the release, writes install notes and exports its workflow values', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(cleanup)
    const fakePnpm = join(root, 'fake-bin/pnpm')
    await writeFile(
      fakePnpm,
      `#!/usr/bin/env bash\nset -euo pipefail\ncase "$1" in\n  build) ;;\n  pack) printf 'fixture tarball' > tmp/release/release-check.tgz ;;\n  *) echo "unexpected pnpm command: $*" >&2; exit 2 ;;\nesac\n`
    )
    await chmod(fakePnpm, 0o755)

    const result = runReleaseCheck(root)

    assert.equal(result.status, 0, result.stderr)
    assert.include(result.stdout, `ready: v${version} tmp/release/release-check.tgz`)
    const notes = await readFile(join(root, 'tmp/release/notes.md'), 'utf8')
    assert.include(
      notes,
      `pnpm add https://github.com/example/release-check-fixture/releases/download/v${version}/release-check.tgz`
    )
    assert.match(notes, /SHA-256: `[a-f0-9]{64}`/)
    assert.deepEqual(
      await readFile(join(root, 'github-env'), 'utf8'),
      `VERSION=${version}\nTARBALL=tmp/release/release-check.tgz\n`
    )
  })
})
