/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { type Change, planChecks, readTestOutcome } from './check_changed_plan.js'

const STEP_TIMEOUT_MS = 10 * 60 * 1000

function git(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr.trim()}`)
  return result.stdout
}

function changedFiles(base: string): Change[] {
  const mergeBase = git(['merge-base', base, 'HEAD']).trim()
  const changes = new Map<string, Change>()
  const fields = git(['diff', '--name-status', '--no-renames', '-z', mergeBase]).split('\0')
  for (let index = 0; index + 1 < fields.length; index += 2) {
    changes.set(fields[index + 1], { path: fields[index + 1], deleted: fields[index] === 'D' })
  }
  for (const path of git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')) {
    if (path) changes.set(path, { path, deleted: false })
  }
  return [...changes.values()]
}

let activeGroup: number | undefined

/** A step runs in its own process group, which the terminal's Ctrl-C does not reach. */
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  process.on(signal, () => {
    if (activeGroup) {
      try {
        process.kill(-activeGroup, 'SIGKILL')
      } catch {}
    }
    process.exit(code)
  })
}

/** Run a command in its own process group, so a hung step can be stopped with its children. */
function run(command: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    activeGroup = child.pid
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const timer = setTimeout(() => {
      output += `\nStopped after ${STEP_TIMEOUT_MS / 1000}s`
      process.kill(-child.pid!, 'SIGKILL')
    }, STEP_TIMEOUT_MS)
    child.on('close', (code) => {
      clearTimeout(timer)
      activeGroup = undefined
      resolve({ code: code ?? 1, output })
    })
  })
}

let failed = false

function report(name: string, passed: boolean, detail: string, output = ''): void {
  console.log(`${name}: ${passed ? 'pass' : 'fail'}${detail ? ` (${detail})` : ''}`)
  if (!passed) {
    failed = true
    console.log(output.trimEnd().split('\n').slice(-30).join('\n'))
  }
}

async function step(name: string, command: string, args: string[]): Promise<boolean> {
  const { code, output } = await run(command, args)
  report(name, code === 0, '', output)
  return code === 0
}

const [base = 'main', ...extra] = process.argv.slice(2)
if (
  extra.length ||
  !spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).stdout.length
) {
  console.error(`Usage: pnpm check:changed [base]. "${base}" is not a known git ref.`)
  process.exit(2)
}

const wanted = readFileSync('.nvmrc', 'utf8').trim()
const current = process.versions.node.split('.')[0]
if (current !== wanted) {
  console.error(
    `runtime: fail (Node ${process.versions.node}; .nvmrc needs ${wanted}). Run \`nvm use\`.`
  )
  process.exit(1)
}

const plan = planChecks(changedFiles(base))

console.log('format: skip (Prettier runs inside ESLint for code files)')

if (plan.lint === 'all') {
  await step('lint', 'pnpm', ['exec', 'eslint', '--max-warnings', '0', '.'])
} else if (plan.lint.length) {
  await step('lint', 'pnpm', [
    'exec',
    'eslint',
    '--max-warnings',
    '0',
    '--no-warn-ignored',
    '--no-error-on-unmatched-pattern',
    ...plan.lint,
  ])
} else console.log('lint: skip (no lintable files changed)')

if (plan.typecheck) await step('typecheck', 'pnpm', ['typecheck'])
else console.log('typecheck: skip (no TypeScript or type config changed)')

// tests/unit/declarations.spec.ts reads build/.
if (plan.tests.length && !(await step('build', 'pnpm', ['build']))) {
  console.log('tests: skip (build failed)')
} else if (plan.tests.length) {
  const explicit = plan.tests !== 'all'
  const files = explicit ? (plan.tests as string[]).flatMap((file) => ['--files', file]) : []
  const { code, output } = await run('pnpm', ['quick:test', ...files])
  const outcome = readTestOutcome(output, code, explicit)
  report('tests', outcome.passed, `${outcome.executed} tests run`, output)
} else console.log('tests: skip (no tests affected)')

if (plan.consumer) await step('consumer', 'pnpm', ['test:consumer'])
else console.log('consumer: skip (consumer gate unchanged)')

console.log('docs: skip (no docs build in this repository)')

process.exit(failed ? 1 : 0)
