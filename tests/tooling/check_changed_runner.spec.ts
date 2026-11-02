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
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from '@japa/runner'
import { resolveStepCommand, runStep, terminateStep } from '../../bin/check_changed_process.js'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const checkChangedPath = join(projectRoot, 'bin/check_changed.ts')
const loaderUrl = pathToFileURL(createRequire(import.meta.url).resolve('@poppinss/ts-exec')).href

async function waitForReady(path: string): Promise<void> {
  const deadline = Date.now() + 2000
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
  const deadline = Date.now() + 2000
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

async function waitForClose<T>(closed: Promise<T>, timeoutMs = 2000): Promise<T> {
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

function terminateFixtureChild(child: ChildProcess): string | undefined {
  if (!child.pid) return
  if (process.platform === 'win32') {
    try {
      const result = spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        timeout: 1000,
        killSignal: 'SIGKILL',
        windowsHide: true,
      })
      if (result.status === 0) return
    } catch (error) {
      try {
        if (child.kill('SIGKILL')) return
      } catch (killError) {
        return `taskkill and direct process termination failed: ${String(killError)}`
      }
      return `taskkill launch failed and direct process termination was rejected: ${String(error)}`
    }
    try {
      if (child.kill('SIGKILL')) return
    } catch (error) {
      return `taskkill and direct process termination failed: ${String(error)}`
    }
    return 'taskkill failed and direct process termination was rejected'
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
    try {
      if (child.kill('SIGKILL')) return
    } catch (killError) {
      return `process group and direct process termination failed: ${String(killError)}`
    }
    return `process group cleanup and direct process termination failed: ${String(error)}`
  }
}

async function terminateFixtureGroup(groupFile: string): Promise<string | undefined> {
  try {
    const groupId = Number(await readFile(groupFile, 'utf8'))
    if (!Number.isInteger(groupId) || groupId <= 0) return
    if (process.platform === 'win32') {
      const result = spawnSync('taskkill.exe', ['/pid', String(groupId), '/t', '/f'], {
        stdio: 'ignore',
        timeout: 1000,
        killSignal: 'SIGKILL',
        windowsHide: true,
      })
      if (result.status === 0) return
      try {
        process.kill(groupId, 'SIGKILL')
        return
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
        return `taskkill and direct step termination failed: ${String(error)}`
      }
    }
    process.kill(-groupId, 'SIGKILL')
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT' ||
      (error as NodeJS.ErrnoException).code === 'ESRCH'
    ) {
      return
    }
    return `step group cleanup failed: ${String(error)}`
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
  const children = new Set<ChildProcess>()
  const childClosures = new WeakMap<ChildProcess, Promise<unknown>>()
  const trackChild = (child: ChildProcess, closed: Promise<unknown>) => {
    children.add(child)
    childClosures.set(child, closed)
    void closed.then(
      () => children.delete(child),
      () => children.delete(child)
    )
  }
  cleanup(async () => {
    const activeChildren = [...children]
    const errors: string[] = []
    for (const child of activeChildren) {
      const error = terminateFixtureChild(child)
      if (error) errors.push(error)
    }
    const firstGroupError = await terminateFixtureGroup(join(root, 'process_group'))
    if (firstGroupError) errors.push(firstGroupError)
    await Promise.all(
      activeChildren.map(async (child) => {
        const closed = childClosures.get(child)
        if (closed) await waitForClose(closed, 1500).catch(() => undefined)
      })
    )
    const finalGroupError = await terminateFixtureGroup(join(root, 'process_group'))
    if (finalGroupError) errors.push(finalGroupError)
    await rm(root, { recursive: true, force: true })
    if (errors.length) throw new AggregateError(errors.map((error) => new Error(error)))
  })
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

  const cleanGitEnv: NodeJS.ProcessEnv = {
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
    `#!/usr/bin/env node\nimport { appendFileSync, writeFileSync } from 'node:fs'\nimport { spawn } from 'node:child_process'\nappendFileSync(process.env.CHECK_CHANGED_LOG, process.argv.slice(2).join(' ') + '\\n')\nif (process.env.CHECK_CHANGED_HANG === '1' && process.argv[2] === 'format:check') {\n  const inheritPipes = process.env.CHECK_CHANGED_EXIT_WITH_DESCENDANT === '1'\n  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: inheritPipes ? ['ignore', 'inherit', 'inherit'] : 'ignore' })\n  writeFileSync(process.env.CHECK_CHANGED_GROUP, String(process.pid))\n  writeFileSync(process.env.CHECK_CHANGED_READY, '')\n  if (inheritPipes) process.exit(0)\n  setInterval(() => {}, 1000)\n}\nif (process.argv[2] === 'quick:test') process.stdout.write(process.env.CHECK_CHANGED_TEST_OUTPUT + '\\n')\nif (process.argv[2] === 'build' && process.env.CHECK_CHANGED_FAIL_BUILD === '1') process.exit(1)\n`
  )
  await chmod(shimPath, 0o755)

  const argsFor = (cliArgs: string[]) => [
    `--import=${loaderUrl}`,
    '--enable-source-maps',
    checkChangedPath,
    ...cliArgs,
  ]
  const envFor = (
    testOutput: string,
    hang = false,
    exitWithDescendant = false
  ): NodeJS.ProcessEnv => ({
    ...process.env,
    PATH: `${shimDirectory}${delimiter}${process.env.PATH}`,
    CHECK_CHANGED_LOG: logPath,
    CHECK_CHANGED_TEST_OUTPUT: testOutput,
    CHECK_CHANGED_READY: join(root, 'ready'),
    CHECK_CHANGED_GROUP: join(root, 'process_group'),
    CHECK_CHANGED_HANG: hang ? '1' : '0',
    CHECK_CHANGED_EXIT_WITH_DESCENDANT: exitWithDescendant ? '1' : '0',
    CHECK_CHANGED_FAIL_BUILD: options.failBuild ? '1' : '0',
    GIT_CONFIG_GLOBAL: inheritedConfigPath,
    GIT_CONFIG_NOSYSTEM: '1',
    npm_execpath: join(shimDirectory, 'pnpm'),
  })

  return {
    inheritedSigningFailure: inheritedSigningFailure?.status,
    inheritedSigningError: inheritedSigningFailure?.stderr ?? '',
    waitForGroupExit: () => waitForProcessGroupExit(join(root, 'process_group')),
    removePnpmShim: () => rm(shimPath),
    run: async (
      testOutput: string,
      cliArgs: string[] = ['main'],
      runOptions: { hang?: boolean; timeoutMs?: number; restrictPath?: boolean } = {}
    ) => {
      await writeFile(logPath, '')
      const childEnv = envFor(testOutput, runOptions.hang)
      if (runOptions.restrictPath) childEnv.PATH = '/usr/bin:/bin'
      const child = spawn(process.execPath, argsFor(cliArgs), {
        cwd: root,
        env: childEnv,
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
      trackChild(child, closed)
      try {
        const result = await waitForClose(closed, runOptions.timeoutMs ?? 15_000)
        return { ...result, stdout, stderr, commands: await readFile(logPath, 'utf8') }
      } catch (error) {
        const cleanupErrors = [
          terminateFixtureChild(child),
          await terminateFixtureGroup(join(root, 'process_group')),
        ].filter((issue): issue is string => Boolean(issue))
        try {
          await waitForClose(closed, 1500)
        } catch (cleanupError) {
          cleanupErrors.push(String(cleanupError))
        }
        if (cleanupErrors.length && error instanceof Error) {
          Object.assign(error, { cleanupError: new AggregateError(cleanupErrors) })
        }
        throw error
      }
    },
    runBlocked: async (testOutput: string, timeout = false, exitWithDescendant = false) => {
      await writeFile(logPath, '')
      const preloadPath = join(root, 'short_timeout.mjs')
      await writeFile(
        preloadPath,
        'const original = globalThis.setTimeout; globalThis.setTimeout = (callback, delay, ...args) => original(callback, delay === 600000 ? 500 : delay, ...args)\n'
      )
      const runnerImports = [`--import=${loaderUrl}`, `--import=${pathToFileURL(preloadPath).href}`]
      const child = spawn(
        process.execPath,
        [...runnerImports, '--enable-source-maps', checkChangedPath, 'main'],
        {
          cwd: root,
          env: envFor(testOutput, true, exitWithDescendant),
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
      trackChild(child, closed)
      try {
        await Promise.race([
          waitForReady(join(root, 'ready')),
          closed.then(() => {
            throw new Error('Runner exited before its test command reached the barrier')
          }),
        ])
        if (!timeout) child.kill('SIGTERM')
        const result = await waitForClose(closed, 2000)
        await waitForProcessGroupExit(join(root, 'process_group'))
        return { ...result, output, commands: await readFile(logPath, 'utf8') }
      } catch (error) {
        const cleanupErrors = [
          terminateFixtureChild(child),
          await terminateFixtureGroup(join(root, 'process_group')),
        ].filter((issue): issue is string => Boolean(issue))
        try {
          await waitForClose(closed, 1500)
        } catch (cleanupError) {
          cleanupErrors.push(String(cleanupError))
        }
        if (cleanupErrors.length && error instanceof Error) {
          Object.assign(error, { cleanupError: new AggregateError(cleanupErrors) })
        }
        throw error
      }
    },
  }
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

  test('selects the package script pnpm entry point on Windows', ({ assert }) => {
    assert.deepEqual(
      resolveStepCommand('pnpm', 'win32', 'node.exe', 'C:/pnpm/pnpm.mjs', ['typecheck']),
      { executable: 'node.exe', args: ['C:/pnpm/pnpm.mjs', 'typecheck'] }
    )
    assert.deepEqual(resolveStepCommand('pnpm', 'win32', 'node.exe', undefined, ['build']), {
      error: 'Could not locate the pnpm JavaScript entry point (npm_execpath).',
    })
    assert.deepEqual(resolveStepCommand('git', 'win32', 'node.exe', 'pnpm.mjs', ['status']), {
      executable: 'git',
      args: ['status'],
    })
  })

  test('returns a clear failure if Windows has no pnpm script entry point', async ({ assert }) => {
    assert.deepEqual(await runStep('pnpm', ['build'], 'win32', 'node.exe', undefined, () => {}), {
      code: 1,
      output: 'Could not locate the pnpm JavaScript entry point (npm_execpath).',
    })
  })

  if (process.platform !== 'win32')
    test('bounds cleanup when process-tree termination fails', async ({ assert }) => {
      for (const killFailure of [
        undefined,
        new Error('direct kill failed'),
        'direct kill failed',
      ]) {
        let childGroup: number | undefined
        try {
          const result = await runStep(
            process.execPath,
            [
              '-e',
              "const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'inherit', 'inherit'] }); process.exit(0)",
            ],
            'darwin',
            process.execPath,
            undefined,
            (pid) => {
              childGroup = pid
            },
            {
              timeoutMs: 25,
              terminationGraceMs: 25,
              ...(killFailure !== undefined
                ? {
                    killChild: () => {
                      throw killFailure
                    },
                  }
                : {}),
              terminate: () => ({
                success: false,
                tree: false,
                detail: 'test process-tree termination failure',
              }),
            }
          )
          assert.equal(result.code, 1)
          assert.include(result.output, 'test process-tree termination failure')
          assert.include(result.output, 'Step did not close after termination')
          if (killFailure !== undefined) {
            assert.include(
              result.output,
              `Direct process termination failed: ${killFailure instanceof Error ? killFailure.message : killFailure}`
            )
          }
        } finally {
          if (childGroup) {
            try {
              process.kill(-childGroup, 'SIGKILL')
            } catch {}
          }
        }
      }
    }).timeout(5000)

  test('reports non-Error process-group termination failures', ({ assert }) => {
    assert.deepEqual(
      terminateStep(
        49,
        'darwin',
        () => ({ status: 0 }),
        () => {
          throw 'permission denied'
        }
      ),
      {
        success: false,
        tree: false,
        detail: 'process group termination failed: permission denied',
      }
    )
  })

  test('uses taskkill and direct process termination fallbacks', ({ assert }) => {
    const calls: Array<{ pid: number; signal: NodeJS.Signals }> = []
    let taskkillArgs: string[] = []
    terminateStep(
      42,
      'win32',
      (args) => {
        taskkillArgs = args
        return { status: 0 }
      },
      (pid, signal) => calls.push({ pid, signal })
    )
    assert.deepEqual(taskkillArgs, ['/pid', '42', '/t', '/f'])
    assert.deepEqual(calls, [])

    const fallback = terminateStep(
      43,
      'win32',
      () => ({ status: 1, error: 'timeout' }),
      (pid, signal) => calls.push({ pid, signal })
    )
    assert.deepEqual(fallback, {
      success: true,
      tree: false,
      detail:
        'taskkill failed (timeout); terminated the step process directly, but descendants may remain',
    })
    assert.deepEqual(
      terminateStep(
        48,
        'win32',
        () => ({ status: 1, error: 'timeout' }),
        () => {
          throw Object.assign(new Error('access denied'), { code: 'EPERM' })
        }
      ),
      {
        success: false,
        tree: false,
        detail: 'taskkill failed (timeout); direct process termination also failed',
      }
    )
    const exitedError = Object.assign(new Error('already exited'), { code: 'ESRCH' })
    const exited = terminateStep(
      44,
      'win32',
      () => ({ status: null }),
      () => {
        throw exitedError
      }
    )
    assert.deepEqual(exited, {
      success: true,
      tree: false,
      detail: 'taskkill failed; the step process already exited, but descendants may remain',
    })
    terminateStep(
      45,
      'darwin',
      () => ({ status: 0 }),
      (pid, signal) => calls.push({ pid, signal })
    )
    terminateStep(2_147_483_647, 'win32')
    const noGroup = Object.assign(new Error('group already exited'), { code: 'ESRCH' })
    assert.deepEqual(
      terminateStep(
        46,
        'darwin',
        () => ({ status: 0 }),
        () => {
          throw noGroup
        }
      ),
      { success: true, tree: true }
    )
    const denied = Object.assign(new Error('permission denied'), { code: 'EPERM' })
    assert.deepEqual(
      terminateStep(
        47,
        'darwin',
        () => ({ status: 0 }),
        () => {
          throw denied
        }
      ),
      {
        success: false,
        tree: false,
        detail: 'process group termination failed: permission denied',
      }
    )
    assert.deepEqual(calls, [
      { pid: 43, signal: 'SIGKILL' },
      { pid: -45, signal: 'SIGKILL' },
    ])
  })

  if (process.platform !== 'win32')
    test('reports a child command start error without throwing', async ({ assert, cleanup }) => {
      const run = await runnerFixture(cleanup)
      await run.removePnpmShim()
      const result = await run.run('', ['main'], { restrictPath: true })
      assert.equal(result.status, 1, result.stdout + result.stderr)
      assert.include(result.stdout, 'Failed to start pnpm:')
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

  if (process.platform !== 'win32')
    test('reports timeout when a successful child leaves a descendant holding output pipes', async ({
      assert,
      cleanup,
    }) => {
      const run = await runnerFixture(cleanup, { change: 'none' })
      const result = await run.runBlocked('', true, true)
      assert.equal(result.status, 1, result.output)
      assert.include(result.output, 'Stopped after 600s')
      assert.include(result.commands, 'format:check')
      assert.include(result.commands, 'docs:check')
    }).timeout(10_000)
})
