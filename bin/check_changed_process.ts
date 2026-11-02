/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { spawn, spawnSync } from 'node:child_process'

const STEP_TIMEOUT_MS = 10 * 60 * 1000

export type StepCommand = { executable: string; args: string[] } | { error: string }

export function resolveStepCommand(
  command: string,
  platform: NodeJS.Platform,
  nodeExecutable: string,
  pnpmEntry: string | undefined,
  args: string[]
): StepCommand {
  if (platform !== 'win32' || command !== 'pnpm') return { executable: command, args }
  if (!pnpmEntry) {
    return { error: 'Could not locate the pnpm JavaScript entry point (npm_execpath).' }
  }
  return { executable: nodeExecutable, args: [pnpmEntry, ...args] }
}

type Taskkill = (args: string[]) => number | null
type Kill = (pid: number, signal: NodeJS.Signals) => void

export function terminateStep(
  pid: number,
  platform: NodeJS.Platform,
  taskkill: Taskkill = (args) =>
    spawnSync('taskkill.exe', args, { stdio: 'ignore', windowsHide: true }).status,
  kill: Kill = (target, signal) => process.kill(target, signal)
): void {
  if (platform === 'win32') {
    const status = taskkill(['/pid', String(pid), '/t', '/f'])
    if (status === 0) return
    try {
      kill(pid, 'SIGKILL')
    } catch {}
    return
  }
  try {
    kill(-pid, 'SIGKILL')
  } catch {}
}

export function runStep(
  command: string,
  args: string[],
  platform: NodeJS.Platform,
  nodeExecutable: string,
  pnpmEntry: string | undefined,
  setActiveChild: (pid: number | undefined) => void
): Promise<{ code: number; output: string }> {
  const invocation = resolveStepCommand(command, platform, nodeExecutable, pnpmEntry, args)
  if ('error' in invocation) {
    return Promise.resolve({ code: 1, output: invocation.error })
  }

  return new Promise((resolve) => {
    const child = spawn(invocation.executable, invocation.args, {
      detached: platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    setActiveChild(child.pid)
    let output = ''
    child.on('error', (error) => {
      output += `\nFailed to start ${command}: ${error.message}`
    })
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const timer = setTimeout(() => {
      output += `\nStopped after ${STEP_TIMEOUT_MS / 1000}s`
      if (child.pid) terminateStep(child.pid, platform)
    }, STEP_TIMEOUT_MS)
    child.on('close', (code) => {
      clearTimeout(timer)
      setActiveChild(undefined)
      resolve({ code: code ?? 1, output })
    })
  })
}
