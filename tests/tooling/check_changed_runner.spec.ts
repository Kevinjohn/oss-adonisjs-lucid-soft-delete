/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from '@japa/runner'
import {
  resolveStepCommand,
  runStep,
  terminateStep,
  terminateStepForSignal,
  updateActiveChild,
} from '../../bin/check_changed_process.js'

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
  await waitForGroupExit(Number(await readFile(groupFile, 'utf8')))
  // The exited group ID can be reused, so later fixture cleanup must not signal it.
  await rm(groupFile, { force: true })
}

async function waitForGroupExit(groupId: number): Promise<void> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    try {
      process.kill(-groupId, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
      // Retry denied probes until the deadline; only ESRCH proves exit.
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Test command process group ${groupId} did not exit`)
}

async function stopFixtureGroup(groupId: number): Promise<void> {
  const result = terminateStep(groupId, process.platform)
  if (!result.success || !result.tree) throw new Error(result.detail)
  await waitForGroupExit(groupId)
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
  const result = terminateStep(child.pid, process.platform)
  if (!result.success || !result.tree) return result.detail
}

function fixtureChildren(terminate = terminateFixtureChild) {
  const children = new Map<ChildProcess, Promise<unknown>>()
  return {
    track(child: ChildProcess, closed: Promise<unknown>) {
      children.set(child, closed)
      void closed.then(
        () => children.delete(child),
        () => {}
      )
    },
    terminate() {
      const pending = [...children]
      const errors: string[] = []
      for (const [child] of pending) {
        const error = terminate(child)
        if (error) errors.push(error)
      }
      return { errors, closures: pending.map(([, closed]) => closed) }
    },
  }
}

async function terminateFixtureGroup(groupFile: string): Promise<string | undefined> {
  try {
    const groupId = Number(await readFile(groupFile, 'utf8'))
    if (!Number.isInteger(groupId) || groupId <= 0) return
    const result = terminateStep(groupId, process.platform)
    if (!result.success || !result.tree) return result.detail
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
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
  const children = fixtureChildren()
  cleanup(async () => {
    const { errors, closures } = children.terminate()
    const firstGroupError = await terminateFixtureGroup(join(root, 'process_group'))
    if (firstGroupError) errors.push(firstGroupError)
    await Promise.all(
      closures.map(async (closed) => {
        try {
          await waitForClose(closed, 1500)
        } catch (error) {
          errors.push(String(error))
        }
      })
    )
    const finalGroupError = await terminateFixtureGroup(join(root, 'process_group'))
    if (finalGroupError) errors.push(finalGroupError)
    try {
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      errors.push(String(error))
    }
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
    `#!/usr/bin/env node\nimport { appendFileSync, writeFileSync } from 'node:fs'\nimport { spawn } from 'node:child_process'\nappendFileSync(process.env.CHECK_CHANGED_LOG, process.argv.slice(2).join(' ') + '\\n')\nif (process.env.CHECK_CHANGED_HANG === '1' && process.argv[2] === 'format:check') {\n  const inheritPipes = process.env.CHECK_CHANGED_EXIT_WITH_DESCENDANT === '1'\n  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: inheritPipes ? ['ignore', 'inherit', 'inherit'] : 'ignore' })\n  writeFileSync(process.env.CHECK_CHANGED_GROUP, String(process.pid))\n  writeFileSync(process.env.CHECK_CHANGED_READY, '')\n  if (inheritPipes) process.exit(0)\n  setInterval(() => {}, 1000)\n}\nif (process.argv[2] === 'quick:test') {\n  appendFileSync(process.env.CHECK_CHANGED_LOG, 'TEST_BUILT_EXPORTS=' + (process.env.TEST_BUILT_EXPORTS ?? '') + '\\n')\n  process.stdout.write(process.env.CHECK_CHANGED_TEST_OUTPUT + '\\n')\n}\nif (process.argv[2] === 'build' && process.env.CHECK_CHANGED_FAIL_BUILD === '1') process.exit(1)\n`
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
    hasGroupRecord: () =>
      access(join(root, 'process_group')).then(
        () => true,
        () => false
      ),
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
      children.track(child, closed)
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
      const preloadPath = join(root, 'short_timeout.js')
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
          detached: process.platform !== 'win32',
          windowsHide: true,
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
      children.track(child, closed)
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
  test('Windows fixture teardown skips confirmed closure and reports pending tree failure', async ({
    assert,
  }) => {
    let taskkillCalls = 0
    const children = fixtureChildren((child) => {
      const result = terminateStep(
        child.pid!,
        'win32',
        () => {
          taskkillCalls += 1
          return { status: 1 }
        },
        () => {
          throw Object.assign(new Error('already exited'), { code: 'ESRCH' })
        }
      )
      if (!result.success || !result.tree) return result.detail
    })
    children.track({ pid: 42 } as ChildProcess, Promise.resolve())
    await Promise.resolve()
    assert.deepEqual(children.terminate(), { errors: [], closures: [] })
    assert.equal(taskkillCalls, 0)

    let close!: () => void
    const pending = new Promise<void>((resolve) => {
      close = resolve
    })
    children.track({ pid: 43 } as ChildProcess, pending)
    const teardown = children.terminate()
    assert.equal(taskkillCalls, 1)
    assert.deepEqual(teardown.errors, [
      'taskkill failed; the step process already exited, but descendants may remain',
    ])
    assert.deepEqual(teardown.closures, [pending])
    await assert.rejects(
      () => waitForClose(teardown.closures[0], 1),
      /Timed out waiting for runner cleanup/
    )
    close()
    await pending
    assert.deepEqual(children.terminate(), { errors: [], closures: [] })
    assert.equal(taskkillCalls, 1)
  })

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

  test('runs the selected tests with built-export specs enabled after the build', async ({
    assert,
    cleanup,
  }) => {
    const run = await runnerFixture(cleanup)
    const result = await run.run('Tests  1 passed (1)')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.include(result.commands, 'build\nquick:test\nTEST_BUILT_EXPORTS=1\n')
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
      resolveStepCommand('pnpm', 'win32', 'node.exe', 'C:/pnpm/pnpm.js', ['typecheck']),
      { executable: 'node.exe', args: ['C:/pnpm/pnpm.js', 'typecheck'] }
    )
    assert.deepEqual(resolveStepCommand('pnpm', 'win32', 'node.exe', undefined, ['build']), {
      error: 'Could not locate the pnpm JavaScript entry point (npm_execpath).',
    })
    assert.deepEqual(resolveStepCommand('git', 'win32', 'node.exe', 'pnpm.js', ['status']), {
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
              if (pid !== undefined) childGroup = pid
            },
            {
              timeoutMs: 250,
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
            await stopFixtureGroup(childGroup)
          }
        }
        assert.isDefined(
          childGroup,
          'test retained the detached group independently of active ownership'
        )
      }
    }).timeout(5000)

  if (process.platform !== 'win32')
    test('a late child close cannot clear the next active step', async ({ assert }) => {
      let firstPid: number | undefined
      let activePid: number | undefined
      let clearCount = 0
      let resolveLateClose!: () => void
      const lateClose = new Promise<void>((resolve) => {
        resolveLateClose = resolve
      })

      let secondPid: number | undefined
      let secondStep: ReturnType<typeof runStep> | undefined
      try {
        const timedOut = await runStep(
          process.execPath,
          ['-e', 'setInterval(() => {}, 1000)'],
          'darwin',
          process.execPath,
          undefined,
          (pid, ownerPid) => {
            if (pid !== undefined) firstPid = pid
            activePid = updateActiveChild(activePid, pid, ownerPid)
            if (pid === undefined && ownerPid === firstPid) {
              clearCount += 1
            }
          },
          {
            timeoutMs: 25,
            terminationGraceMs: 25,
            terminate: () => ({
              success: false,
              tree: false,
              detail: 'controlled termination failure',
            }),
            killChild: (child) => {
              child.once('close', resolveLateClose)
              return false
            },
          }
        )
        assert.equal(timedOut.code, 1)
        assert.equal(clearCount, 1)
        assert.isDefined(firstPid)

        secondStep = runStep(
          process.execPath,
          ['-e', 'setInterval(() => {}, 1000)'],
          'darwin',
          process.execPath,
          undefined,
          (pid, ownerPid) => {
            if (pid !== undefined) secondPid = pid
            activePid = updateActiveChild(activePid, pid, ownerPid)
          }
        )
        assert.isDefined(secondPid)

        process.kill(-firstPid!, 'SIGKILL')
        await waitForClose(lateClose, 2000)
        assert.equal(activePid, secondPid)
        assert.equal(clearCount, 1)
      } finally {
        const groups = [firstPid, secondPid].filter((pid): pid is number => pid !== undefined)
        await Promise.all(groups.map(stopFixtureGroup))
        if (secondStep) await waitForClose(secondStep, 2000)
      }
    }).timeout(5000)

  test('keeps active ownership when an earlier owner clears', ({ assert }) => {
    assert.equal(updateActiveChild(52, undefined, 51), 52)
    assert.isUndefined(updateActiveChild(52, undefined, 52))
  })

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

  test('reports process-tree cleanup failures from a signal handler', ({ assert }) => {
    const reported: string[] = []
    const originalError = console.error
    try {
      console.error = (message: string) => reported.push(message)
      terminateStepForSignal(50, 'darwin', () => ({
        success: false,
        tree: false,
        detail: 'default reporter',
      }))
    } finally {
      console.error = originalError
    }
    assert.deepEqual(reported.splice(0), [
      'Could not fully terminate check step process tree: default reporter',
    ])
    terminateStepForSignal(
      50,
      'darwin',
      () => ({ success: true, tree: true }),
      (message) => reported.push(message)
    )
    assert.deepEqual(reported, [])
    terminateStepForSignal(
      50,
      'darwin',
      () => ({ success: false, tree: false, detail: 'process group termination failed: EPERM' }),
      (message) => reported.push(message)
    )
    terminateStepForSignal(
      51,
      'win32',
      () => ({ success: true, tree: false, detail: 'descendants may remain' }),
      (message) => reported.push(message)
    )
    assert.deepEqual(reported, [
      'Could not fully terminate check step process tree: process group termination failed: EPERM',
      'Could not fully terminate check step process tree: descendants may remain',
    ])
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
    assert.include(result.stdout, 'test suite: skip (--static)')
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
      assert.isFalse(await run.hasGroupRecord())
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
