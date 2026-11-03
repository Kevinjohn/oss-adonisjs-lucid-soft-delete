/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { spawnSync } from 'node:child_process'
import { relative } from 'node:path'
import { repoRoot } from './settings.mjs'

function redact(value) {
  const password = process.env.DB_PASSWORD
  return password ? String(value).split(password).join('[REDACTED]') : String(value)
}

/** Run one command and retain its useful output in the consumer-gate log. */
export function run(command, args, cwd, environment = process.env) {
  const label = `${command} ${args.join(' ')}`
  console.log(`\n[${relative(repoRoot, cwd) || '.'}] $ ${label}`)
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  const output = [result.stdout, result.stderr].filter(Boolean).join('')
  if (output) console.log(redact(output).trimEnd())
  if (result.error || result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status ?? 'could not start'}): ${redact(result.error?.message ?? output.slice(-6000))}`
    )
  }
  return result.stdout
}
