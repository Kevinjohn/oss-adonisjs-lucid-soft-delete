/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'

const pgScript = fileURLToPath(new URL('../../bin/pg.sh', import.meta.url))

/** A copy of pg.sh in its own root, with fake PostgreSQL 16 binaries and no Homebrew. */
async function fixture(cleanup: (fn: () => Promise<void>) => void) {
  const root = await mkdtemp(join(tmpdir(), 'pg-lock-'))
  cleanup(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'bin'))
  await copyFile(pgScript, join(root, 'bin/pg.sh'))
  const fakeBin = join(root, 'fake-bin')
  await mkdir(fakeBin)
  await writeFile(
    join(fakeBin, 'pg_ctl'),
    '#!/usr/bin/env bash\ncase "$1" in --version) echo "pg_ctl (PostgreSQL) 16.4";; *) exit 3;; esac\n'
  )
  await writeFile(join(fakeBin, 'brew'), '#!/usr/bin/env bash\nexit 1\n')
  for (const utility of ['postgres', 'initdb', 'pg_isready', 'psql', 'createdb']) {
    await writeFile(join(fakeBin, utility), '#!/usr/bin/env bash\nexit 0\n')
  }
  for (const file of await readdir(fakeBin)) await chmod(join(fakeBin, file), 0o755)
  await mkdir(join(root, 'tmp/pg16.lock'), { recursive: true })
  return root
}

function stop(root: string) {
  return spawnSync('bash', [join(root, 'bin/pg.sh'), 'stop'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(root, 'fake-bin')}:${process.env.PATH}` },
  })
}

/** A PID that no longer exists. */
function deadPid() {
  return spawnSync('true').pid
}

test.group('pg.sh lock', () => {
  test('keeps the first taker as owner while a second taker attempts stale recovery', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(cleanup)
    await writeFile(join(root, 'tmp/pg16.lock/owner'), `${deadPid()}\n`)
    await writeFile(
      join(root, 'fake-bin/pg_ctl'),
      '#!/usr/bin/env bash\ncase "$1" in --version) echo "pg_ctl (PostgreSQL) 16.4";; -D) echo ENTERED; read -r _; exit 3;; esac\n'
    )
    const first = spawn('bash', [join(root, 'bin/pg.sh'), 'stop'], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${join(root, 'fake-bin')}:${process.env.PATH}` },
    })
    cleanup(async () => {
      first.stdin.end('\n')
      if (first.exitCode === null) first.kill()
    })
    const entered = new Promise<void>((resolve, reject) => {
      let output = ''
      first.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString()
        if (output.includes('ENTERED')) resolve()
      })
      first.on('exit', (code) => reject(new Error(`first taker exited before barrier: ${code}`)))
    })
    await entered
    const owner = await readFile(join(root, 'tmp/pg16.lock/owner'), 'utf8')
    const second = stop(root)
    assert.notEqual(second.status, 0)
    assert.include(second.stderr, 'cluster lock busy')
    assert.equal(owner, `${first.pid}\n`)
    const exited = new Promise<number | null>((resolve) => first.on('exit', resolve))
    first.stdin.end('\n')
    const code = await exited
    assert.equal(code, 0)
    assert.deepEqual(await readdir(join(root, 'tmp')), [])
  })

  test('takes over a lock whose owner is gone, replacing the whole directory', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(cleanup)
    await writeFile(join(root, 'tmp/pg16.lock/owner'), `${deadPid()}\n`)
    // A second taker's partial state must not block the takeover.
    await writeFile(join(root, 'tmp/pg16.lock/owner.partial'), '')

    const result = stop(root)

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(await readdir(join(root, 'tmp')), [])
  })

  test('refuses a lock whose owner is alive', async ({ assert, cleanup }) => {
    const root = await fixture(cleanup)
    await writeFile(join(root, 'tmp/pg16.lock/owner'), `${process.pid}\n`)

    const result = stop(root)

    assert.notEqual(result.status, 0)
    assert.include(result.stderr, 'cluster lock busy')
    assert.deepEqual(await readdir(join(root, 'tmp/pg16.lock')), ['owner'])
  })

  test('leaves an ownerless lock untouched after interrupted publication', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(cleanup)

    const result = stop(root)

    assert.notEqual(result.status, 0)
    assert.include(result.stderr, 'cluster lock busy')
    assert.deepEqual(await readdir(join(root, 'tmp/pg16.lock')), [])
    assert.deepEqual(await readdir(join(root, 'tmp')), ['pg16.lock'])
  })
})
