/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'

const STEP_TIMEOUT_MS = 10 * 60 * 1000
const TERMINATION_TIMEOUT_MS = 2_000
const TERMINATION_GRACE_MS = 2_000

export type StepCommand = { executable: string; args: string[] } | { error: string }

export function updateActiveChild(
  currentPid: number | undefined,
  nextPid: number | undefined,
  ownerPid: number | undefined
): number | undefined {
  if (nextPid !== undefined) return nextPid
  return currentPid === ownerPid ? undefined : currentPid
}

type StepCommandOptions = {
  command: string
  args: string[]
  platform: NodeJS.Platform
  nodeExecutable: string
  pnpmEntry?: string
}

export function resolveStepCommand({
  command,
  platform,
  nodeExecutable,
  pnpmEntry,
  args,
}: StepCommandOptions): StepCommand {
  if (platform !== 'win32' || command !== 'pnpm') return { executable: command, args }
  if (!pnpmEntry) {
    return { error: 'Could not locate the pnpm JavaScript entry point (npm_execpath).' }
  }
  return { executable: nodeExecutable, args: [pnpmEntry, ...args] }
}

type Taskkill = (args: string[]) => { status: number | null; error?: string }
type Kill = (pid: number, signal: NodeJS.Signals) => void
type Terminate = typeof terminateStep
type RunStepOptions = StepCommandOptions & {
  setActiveChild: SetActiveChild
  timeoutMs?: number
  terminationGraceMs?: number
  terminate?: Terminate
  killChild?: (child: ChildProcess) => boolean
}
type SetActiveChild = (pid: number | undefined, ownerPid: number | undefined) => void
export type TerminationResult =
  | { success: true; tree: true }
  | { success: true; tree: false; detail: string }
  | { success: false; tree: false; detail: string }

type TerminateStepOptions = {
  pid: number
  platform: NodeJS.Platform
  taskkill?: Taskkill
  kill?: Kill
}

/** Windows process-tree cleanup uses the built-in taskkill.exe command with a finite timeout. */
export function terminateStep({
  pid,
  platform,
  taskkill = (args) => {
    const result = spawnSync('taskkill.exe', args, {
      stdio: 'ignore',
      timeout: TERMINATION_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      windowsHide: true,
    })
    return { status: result.status, error: result.error?.message }
  },
  kill = (target, signal) => process.kill(target, signal),
}: TerminateStepOptions): TerminationResult {
  if (platform === 'win32') {
    const taskkillResult = taskkill(['/pid', String(pid), '/t', '/f'])
    if (taskkillResult.status === 0) return { success: true, tree: true }
    const taskkillError = taskkillResult.error ? ` (${taskkillResult.error})` : ''
    try {
      kill(pid, 'SIGKILL')
      return {
        success: true,
        tree: false,
        detail: `taskkill failed${taskkillError}; terminated the step process directly, but descendants may remain`,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return {
          success: true,
          tree: false,
          detail: `taskkill failed${taskkillError}; the step process already exited, but descendants may remain`,
        }
      }
    }
    return {
      success: false,
      tree: false,
      detail: `taskkill failed${taskkillError}; direct process termination also failed`,
    }
  }
  try {
    kill(-pid, 'SIGKILL')
    return { success: true, tree: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return { success: true, tree: true }
    return {
      success: false,
      tree: false,
      detail: `process group termination failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

type SignalTerminationOptions = {
  pid: number
  platform: NodeJS.Platform
  terminate?: Terminate
  report?: (message: string) => void
}

export function terminateStepForSignal({
  pid,
  platform,
  terminate = terminateStep,
  report = (message) => console.error(message),
}: SignalTerminationOptions): void {
  const result = terminate({ pid, platform })
  if (!result.success || !result.tree) {
    report(`Could not fully terminate check step process tree: ${result.detail}`)
  }
}

export function runStep({
  command,
  args,
  platform,
  nodeExecutable,
  pnpmEntry,
  setActiveChild,
  timeoutMs = STEP_TIMEOUT_MS,
  terminationGraceMs = TERMINATION_GRACE_MS,
  terminate = terminateStep,
  killChild = (child) => child.kill('SIGKILL'),
}: RunStepOptions): Promise<{ code: number; output: string }> {
  const invocation = resolveStepCommand({ command, platform, nodeExecutable, pnpmEntry, args })
  if ('error' in invocation) {
    return Promise.resolve({ code: 1, output: invocation.error })
  }

  return new Promise((resolve) => {
    const child = spawn(invocation.executable, invocation.args, {
      detached: platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const childPid = child.pid
    setActiveChild(childPid, childPid)
    const clearActiveChild = () => {
      if (childPid !== undefined) setActiveChild(undefined, childPid)
    }
    let output = ''
    let timedOut = false
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      clearActiveChild()
      resolve({ code, output })
    }
    let terminationTimer: NodeJS.Timeout | undefined
    child.on('error', (error) => {
      output += `\nFailed to start ${command}: ${error.message}`
    })
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const timer = setTimeout(() => {
      timedOut = true
      output += `\nStopped after ${timeoutMs / 1000}s`
      // A still-open child has a PID; spawn failures emit close and clear this timer first.
      const result = terminate({ pid: child.pid!, platform })
      if (!result.success || !result.tree) output += `\n${result.detail}`
      terminationTimer = setTimeout(() => {
        output += '\nStep did not close after termination; closing its output streams'
        child.stdout.destroy()
        child.stderr.destroy()
        try {
          killChild(child)
        } catch (error) {
          output += `\nDirect process termination failed: ${error instanceof Error ? error.message : String(error)}`
        }
        finish(1)
      }, terminationGraceMs)
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (terminationTimer) clearTimeout(terminationTimer)
      finish(timedOut ? 1 : (code ?? 1))
    })
  })
}
