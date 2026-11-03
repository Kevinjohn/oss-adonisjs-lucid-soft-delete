/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { type Change, planChecks, readTestOutcome } from './check_changed_plan.js'
import { runStep, terminateStepForSignal, updateActiveChild } from './check_changed_process.js'

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

let activeChild: number | undefined

function killStep(pid: number): void {
  terminateStepForSignal(pid, process.platform)
}

/** Stop the active step and its descendants when the runner receives a terminal signal. */
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  process.on(signal, () => {
    if (activeChild) killStep(activeChild)
    process.exit(code)
  })
}

/** Run a command with a bounded timeout and platform-specific child cleanup. */
function run(command: string, args: string[]): Promise<{ code: number; output: string }> {
  return runStep(
    command,
    args,
    process.platform,
    process.execPath,
    process.env.npm_execpath,
    (pid, ownerPid) => {
      activeChild = updateActiveChild(activeChild, pid, ownerPid)
    }
  )
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

const args = process.argv.slice(2)
const staticOnly = args.includes('--static')
const [base = 'main', ...extra] = args.filter((arg) => arg !== '--static')
if (
  extra.length ||
  !spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).stdout.length
) {
  console.error(`Usage: pnpm check:changed [--static] [base]. "${base}" is not a known git ref.`)
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

const plan = planChecks(changedFiles(base), staticOnly)

await step('format', 'pnpm', ['format:check'])

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

// tests/declarations.spec.ts reads build/.
if (plan.tests.length && !(await step('build', 'pnpm', ['build']))) {
  console.log('tests: skip (build failed)')
} else if (plan.tests.length) {
  const explicit = plan.tests !== 'all'
  const files = explicit ? (plan.tests as string[]).flatMap((file) => ['--files', file]) : []
  const { code, output } = await run('pnpm', ['quick:test', ...files])
  const outcome = readTestOutcome(output, code)
  report('tests', outcome.passed, `${outcome.executed} tests run`, output)
} else if (!plan.skipped.includes('test suite')) console.log('tests: skip (no tests affected)')
if (plan.skipped.includes('test suite')) console.log('test suite: skip (--static)')

if (plan.consumer) await step('consumer', 'pnpm', ['test:consumer'])
else if (plan.skipped.includes('consumer')) console.log('consumer: skip (--static)')
else console.log('consumer: skip (no consumer inputs changed)')

await step('docs', 'pnpm', ['docs:check'])

process.exit(failed ? 1 : 0)
