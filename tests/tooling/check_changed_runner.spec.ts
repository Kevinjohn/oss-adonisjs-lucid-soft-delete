/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from '@japa/runner'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const checkChangedPath = join(projectRoot, 'bin/check_changed.ts')
const loaderUrl = pathToFileURL(createRequire(import.meta.url).resolve('@poppinss/ts-exec')).href

async function waitForReady(path: string): Promise<void> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      await access(path)
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for the test command readiness marker')
}

async function waitForProcessGroupExit(groupFile: string): Promise<void> {
  const groupId = Number(await readFile(groupFile, 'utf8'))
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      process.kill(-groupId, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Test command process group ${groupId} did not exit`)
}

async function waitForClose<T>(closed: Promise<T>, timeoutMs = 15_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      closed,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Timed out waiting for runner cleanup')),
          timeoutMs
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

type FixtureOptions = {
  change?: 'source' | 'package' | 'docs' | 'none'
  runtimeVersion?: string
  failBuild?: boolean
  probeInheritedSigning?: boolean
}

async function runnerFixture(
  cleanup: (fn: () => Promise<void>) => void,
  options: FixtureOptions = {}
) {
  const root = await mkdtemp(join(tmpdir(), 'check-changed-runner-'))
  cleanup(() => rm(root, { recursive: true, force: true }))
  const shimDirectory = join(root, 'bin')
  const logPath = join(root, 'pnpm.log')
  const globalConfigPath = join(root, 'isolated.gitconfig')
  const inheritedConfigPath = join(root, 'inherited.gitconfig')
  const hooksDirectory = join(root, 'empty-hooks')
  await mkdir(shimDirectory)
  await mkdir(hooksDirectory)
  await writeFile(logPath, '')
  await writeFile(globalConfigPath, '')
  await writeFile(
    inheritedConfigPath,
    '[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = missing-test-signer\n'
  )
  await mkdir(join(root, 'src'))
  await writeFile(join(root, '.nvmrc'), `${options.runtimeVersion ?? '24'}\n`)
  await writeFile(join(root, 'src/marker.ts'), 'export const marker = 0\n')
  await writeFile(join(root, 'package.json'), '{}\n')

  const cleanGitEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfigPath,
    GIT_CONFIG_NOSYSTEM: '1',
  }
  for (const key of Object.keys(cleanGitEnv)) {
    if (
      key.startsWith('GIT_CONFIG_') &&
      key !== 'GIT_CONFIG_GLOBAL' &&
      key !== 'GIT_CONFIG_NOSYSTEM'
    ) {
      delete cleanGitEnv[key]
    }
  }
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], {
    cwd: root,
    env: cleanGitEnv,
  })
  execFileSync('git', ['add', '.'], { cwd: root, env: cleanGitEnv })
  const inheritedSigningFailure = options.probeInheritedSigning
    ? spawnSync(
        'git',
        [
          '-c',
          'user.name=Test User',
          '-c',
          'user.email=test@example.invalid',
          'commit',
          '--quiet',
          '-m',
          'probe',
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: { ...cleanGitEnv, GIT_CONFIG_GLOBAL: inheritedConfigPath },
        }
      )
    : undefined
  execFileSync(
    'git',
    [
      '-c',
      'commit.gpgsign=false',
      '-c',
      `core.hooksPath=${hooksDirectory}`,
      '-c',
      'user.name=Test User',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ],
    { cwd: root, env: cleanGitEnv }
  )
  switch (options.change ?? 'source') {
    case 'source':
      await writeFile(join(root, 'src/marker.ts'), 'export const marker = 1\n')
      break
    case 'package':
      await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n')
      break
    case 'docs':
      await writeFile(join(root, 'notes.md'), '# Notes\n')
      break
  }

  const shimPath = join(shimDirectory, 'pnpm')
  await writeFile(
    shimPath,
    `#!/usr/bin/env node\nimport { appendFileSync, writeFileSync } from 'node:fs'\nimport { spawn } from 'node:child_process'\nappendFileSync(process.env.CHECK_CHANGED_LOG, process.argv.slice(2).join(' ') + '\\n')\nif (process.env.CHECK_CHANGED_HANG === '1' && process.argv[2] === 'format:check') {\n  writeFileSync(process.env.CHECK_CHANGED_GROUP, String(process.pid))\n  writeFileSync(process.env.CHECK_CHANGED_READY, '')\n  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })\n  setInterval(() => {}, 1000)\n}\nif (process.argv[2] === 'quick:test') process.stdout.write(process.env.CHECK_CHANGED_TEST_OUTPUT + '\\n')\nif (process.argv[2] === 'build' && process.env.CHECK_CHANGED_FAIL_BUILD === '1') process.exit(1)\n`
  )
  await chmod(shimPath, 0o755)

  const argsFor = (cliArgs: string[]) => [
    `--import=${loaderUrl}`,
    '--enable-source-maps',
    checkChangedPath,
    ...cliArgs,
  ]
  const envFor = (testOutput: string, hang = false): NodeJS.ProcessEnv => ({
    ...process.env,
    PATH: `${shimDirectory}${delimiter}${process.env.PATH}`,
    CHECK_CHANGED_LOG: logPath,
    CHECK_CHANGED_TEST_OUTPUT: testOutput,
    CHECK_CHANGED_READY: join(root, 'ready'),
    CHECK_CHANGED_GROUP: join(root, 'process_group'),
    CHECK_CHANGED_HANG: hang ? '1' : '0',
    CHECK_CHANGED_FAIL_BUILD: options.failBuild ? '1' : '0',
    GIT_CONFIG_GLOBAL: inheritedConfigPath,
    GIT_CONFIG_NOSYSTEM: '1',
    npm_execpath: join(shimDirectory, 'pnpm'),
  })

  return {
    inheritedSigningFailure: inheritedSigningFailure?.status,
    inheritedSigningError: inheritedSigningFailure?.stderr ?? '',
    waitForGroupExit: () => waitForProcessGroupExit(join(root, 'process_group')),
    run: async (
      testOutput: string,
      cliArgs: string[] = ['main'],
      runOptions: { hang?: boolean; timeoutMs?: number } = {}
    ) => {
      await writeFile(logPath, '')
      const child = spawn(process.execPath, argsFor(cliArgs), {
        cwd: root,
        env: envFor(testOutput, runOptions.hang),
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (chunk) => (stdout += chunk))
      child.stderr?.on('data', (chunk) => (stderr += chunk))
      const closed = new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => child.once('close', (status, signal) => resolve({ status, signal }))
      )
      try {
        const result = await waitForClose(closed, runOptions.timeoutMs ?? 15_000)
        return { ...result, stdout, stderr, commands: await readFile(logPath, 'utf8') }
      } catch (error) {
        if (child.pid) {
          if (process.platform === 'win32') {
            spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
              stdio: 'ignore',
              windowsHide: true,
            })
          } else {
            try {
              process.kill(-child.pid, 'SIGKILL')
            } catch {}
            try {
              const groupId = Number(await readFile(join(root, 'process_group'), 'utf8'))
              if (Number.isInteger(groupId) && groupId > 0) process.kill(-groupId, 'SIGKILL')
            } catch (cleanupError) {
              if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
                if (error instanceof Error) Object.assign(error, { cleanupError })
              }
            }
          }
        }
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        try {
          await waitForClose(closed)
        } catch (cleanupError) {
          if (error instanceof Error) Object.assign(error, { cleanupError })
        }
        throw error
      }
    },
    runBlocked: async (testOutput: string, timeout = false) => {
      await writeFile(logPath, '')
      const preloadPath = join(root, 'short_timeout.mjs')
      await writeFile(
        preloadPath,
        'const original = globalThis.setTimeout; globalThis.setTimeout = (callback, delay, ...args) => original(callback, delay === 600000 ? 500 : delay, ...args)\n'
      )
      const child = spawn(
        process.execPath,
        [
          `--import=${loaderUrl}`,
          `--import=${pathToFileURL(preloadPath).href}`,
          '--enable-source-maps',
          checkChangedPath,
          'main',
        ],
        {
          cwd: root,
          env: envFor(testOutput, true),
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
      let output = ''
      child.stdout?.on('data', (chunk) => (output += chunk))
      child.stderr?.on('data', (chunk) => (output += chunk))
      const closed = new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => {
          child.once('close', (status, signal) => resolve({ status, signal }))
        }
      )
      try {
        await Promise.race([
          waitForReady(join(root, 'ready')),
          closed.then(() => {
            throw new Error('Runner exited before its test command reached the barrier')
          }),
        ])
        if (!timeout) child.kill('SIGTERM')
        const result = await waitForClose(closed)
        await waitForProcessGroupExit(join(root, 'process_group'))
        return { ...result, output, commands: await readFile(logPath, 'utf8') }
      } catch (error) {
        try {
          const groupId = Number(await readFile(join(root, 'process_group'), 'utf8'))
          if (Number.isInteger(groupId) && groupId > 0) process.kill(-groupId, 'SIGKILL')
        } catch (cleanupError) {
          if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT' && error instanceof Error) {
            Object.assign(error, { cleanupError })
          }
        }
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        try {
          await waitForClose(closed)
        } catch (cleanupError) {
          if (error instanceof Error) Object.assign(error, { cleanupError })
        }
        throw error
      }
    },
  }
}

function hangingPnpmShim(): string {
  return 'if [ "$CHECK_CHANGED_HANG" = "1" ] && [ "$1" = "format:check" ]; then printf \'%s\\n\' "$$" > "$CHECK_CHANGED_GROUP"; touch "$CHECK_CHANGED_READY"; while :; do sleep 1; done; fi'
}

test.group('check:changed runner test outcome', () => {
  test('fails a zero-test full-suite run and continues to documentation checks', async ({
    assert,
    cleanup,
  }) => {
    const run = await runnerFixture(cleanup)
    for (const testOutput of ['', ' NO TESTS EXECUTED ']) {
      const result = await run.run(testOutput)
      assert.equal(result.status, 1, result.stdout + result.stderr)
      assert.include(result.stdout, 'tests: fail (0 tests run)')
      assert.include(result.commands, 'quick:test')
      assert.include(result.commands, 'docs:check')
    }
  })

  test('accepts a successful Japa summary and continues to documentation checks', async ({
    assert,
    cleanup,
  }) => {
    const run = await runnerFixture(cleanup)
    const result = await run.run('Tests  2 passed, 1 skipped (3)')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.include(result.stdout, 'tests: pass (2 tests run)')
    assert.include(result.commands, 'quick:test')
    assert.include(result.commands, 'docs:check')
  })

  test('accepts a passing summary that includes todo tests', async ({ assert, cleanup }) => {
    const run = await runnerFixture(cleanup)
    const result = await run.run('Tests  1 passed, 1 todo (2)')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.include(result.stdout, 'tests: pass (1 tests run)')
    assert.include(result.commands, 'docs:check')
  })

  test('isolates fixture commits from inherited signing configuration', async ({
    assert,
    cleanup,
  }) => {
    const run = await runnerFixture(cleanup, { probeInheritedSigning: true })
    assert.equal(run.inheritedSigningFailure, 128)
    assert.include(run.inheritedSigningError, 'missing-test-signer')
    const result = await run.run('Tests  1 passed (1)')
    assert.equal(result.status, 0, result.stdout + result.stderr)
  })

  test('runs documentation checks for an untracked documentation-only change', async ({
    assert,
    cleanup,
  }) => {
    const run = await runnerFixture(cleanup, { change: 'docs' })
    const result = await run.run('')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.include(result.stdout, 'tests: skip (no tests affected)')
    assert.include(result.stdout, 'consumer: skip (no consumer inputs changed)')
    assert.include(result.commands, 'docs:check')
  })

  test('rejects unknown base refs and extra arguments before running checks', async ({
    assert,
    cleanup,
  }) => {
    const run = await runnerFixture(cleanup, { change: 'none' })
    for (const cliArgs of [['missing'], ['main', 'extra']]) {
      const result = await run.run('', cliArgs)
      assert.equal(result.status, 2, result.stdout + result.stderr)
      assert.include(result.stderr, 'is not a known git ref')
      assert.equal(result.commands, '')
    }
  })

  if (process.platform !== 'win32')
    test('bounds a hung runner and cleans up its process group', async ({ assert, cleanup }) => {
      const run = await runnerFixture(cleanup, { change: 'none' })
      await assert.rejects(
        () => run.run('', ['main'], { hang: true, timeoutMs: 2000 }),
        /Timed out waiting for runner cleanup/
      )
      await run.waitForGroupExit()
    }).timeout(10_000)

  test('rejects a runtime that differs from the repository requirement', async ({
    assert,
    cleanup,
  }) => {
    const run = await runnerFixture(cleanup, { change: 'none', runtimeVersion: '23' })
    const result = await run.run('')
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.include(result.stderr, 'runtime: fail')
    assert.equal(result.commands, '')
  })

  test('lints the whole project when a package manifest changes', async ({ assert, cleanup }) => {
    const run = await runnerFixture(cleanup, { change: 'package' })
    const result = await run.run('Tests  2 passed (2)')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.include(result.commands, 'exec eslint --max-warnings 0 .')
  })

  test('skips the full suite and consumer gate in static mode', async ({ assert, cleanup }) => {
    const run = await runnerFixture(cleanup)
    const result = await run.run('', ['--static', 'main'])
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.include(result.stdout, 'unit suite: skip (--static)')
    assert.include(result.stdout, 'consumer: skip (--static)')
    assert.include(result.commands, 'docs:check')
  })

  test('skips tests after a build failure and still checks documentation', async ({
    assert,
    cleanup,
  }) => {
    const run = await runnerFixture(cleanup, { failBuild: true })
    const result = await run.run('')
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.include(result.stdout, 'tests: skip (build failed)')
    assert.notInclude(result.commands, 'quick:test')
    assert.include(result.commands, 'docs:check')
  })

  if (process.platform !== 'win32')
    test('stops a blocked check on SIGTERM and kills its command group', async ({
      assert,
      cleanup,
    }) => {
      const run = await runnerFixture(cleanup, { change: 'none' })
      const result = await run.runBlocked('')
      assert.equal(result.status, 143, result.output)
      assert.include(result.commands, 'format:check')
      assert.notInclude(result.commands, 'docs:check')
    }).timeout(10_000)

  if (process.platform !== 'win32')
    test('kills a timed-out check and continues to later checks', async ({ assert, cleanup }) => {
      const run = await runnerFixture(cleanup, { change: 'none' })
      const result = await run.runBlocked('', true)
      assert.equal(result.status, 1, result.output)
      assert.include(result.output, 'Stopped after 600s')
      assert.include(result.commands, 'format:check')
      assert.include(result.commands, 'docs:check')
    }).timeout(10_000)
})
