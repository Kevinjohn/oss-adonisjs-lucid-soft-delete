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

function outputIncludes(child: ReturnType<typeof spawn>, marker: string) {
  return new Promise<void>((resolve, reject) => {
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes(marker)) resolve()
    })
    child.on('exit', (code) => reject(new Error(`taker exited before ${marker}: ${code}`)))
  })
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
    await writeFile(
      join(root, 'fake-bin/mkdir'),
      '#!/usr/bin/env bash\ncase "$1" in *pg16.lock.reaping) echo GATE; read -r _;; esac\nexec /bin/mkdir "$@"\n'
    )
    await chmod(join(root, 'fake-bin/mkdir'), 0o755)
    const first = spawn('bash', [join(root, 'bin/pg.sh'), 'stop'], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${join(root, 'fake-bin')}:${process.env.PATH}` },
    })
    cleanup(async () => {
      first.stdin.end('\n')
      if (first.exitCode === null) first.kill()
    })
    await outputIncludes(first, 'GATE')
    const second = spawn('bash', [join(root, 'bin/pg.sh'), 'stop'], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${join(root, 'fake-bin')}:${process.env.PATH}` },
    })
    cleanup(async () => {
      second.stdin.end('\n')
      if (second.exitCode === null) second.kill()
    })
    await outputIncludes(second, 'GATE')
    const entered = outputIncludes(first, 'ENTERED')
    first.stdin.write('\n')
    await entered
    const owner = await readFile(join(root, 'tmp/pg16.lock/owner'), 'utf8')
    let secondError = ''
    second.stderr.on('data', (chunk: Buffer) => (secondError += chunk.toString()))
    const secondExited = new Promise<number | null>((resolve) => second.on('exit', resolve))
    second.stdin.end('\n')
    assert.notEqual(await secondExited, 0)
    assert.include(secondError, 'cluster lock busy')
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

  test('fails closed when publication is interrupted before the owner rename', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(cleanup)
    await rm(join(root, 'tmp/pg16.lock'), { recursive: true })
    await writeFile(
      join(root, 'fake-bin/mv'),
      '#!/usr/bin/env bash\necho PUBLISH; read -r _\nexec /bin/mv "$@"\n'
    )
    await chmod(join(root, 'fake-bin/mv'), 0o755)
    const first = spawn('bash', [join(root, 'bin/pg.sh'), 'stop'], {
      cwd: root,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${join(root, 'fake-bin')}:${process.env.PATH}` },
    })
    cleanup(async () => {
      if (first.exitCode === null && first.signalCode === null) {
        try {
          process.kill(-first.pid!, 'SIGKILL')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        }
      }
    })
    await outputIncludes(first, 'PUBLISH')
    const exited = new Promise<void>((resolve) => first.on('exit', () => resolve()))
    process.kill(-first.pid!, 'SIGKILL')
    await exited

    const lockFiles = await readdir(join(root, 'tmp/pg16.lock'))
    assert.isFalse(lockFiles.includes('owner'))
    assert.isTrue(lockFiles.some((file) => file.startsWith('owner.')))
    assert.include(await readdir(join(root, 'tmp')), 'pg16.lock.reaping')
    const second = stop(root)
    assert.notEqual(second.status, 0)
    assert.include(second.stderr, 'cluster lock busy')
  })

  for (const record of ['123x\n', '12', '1\n2\n', '99999999999\n', '0\n']) {
    test(`refuses malformed owner record ${JSON.stringify(record)}`, async ({
      assert,
      cleanup,
    }) => {
      const root = await fixture(cleanup)
      await writeFile(join(root, 'tmp/pg16.lock/owner'), record)

      const result = stop(root)

      assert.notEqual(result.status, 0)
      assert.include(result.stderr, 'cluster lock busy')
      assert.equal(await readFile(join(root, 'tmp/pg16.lock/owner'), 'utf8'), record)
    })
  }
})
