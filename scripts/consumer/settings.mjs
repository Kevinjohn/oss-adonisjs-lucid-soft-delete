/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageName = '@kevinjohn/lucid-soft-deletes'
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const fixtureRoot = join(repoRoot, 'examples/app')

if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error(`The installed-consumer gate requires Node 24; found ${process.versions.node}`)
}

const arguments_ = process.argv.slice(2)
const compatibilityArguments = arguments_.filter((argument) =>
  argument.startsWith('--compatibility=')
)
if (compatibilityArguments.length > 1 || arguments_.length !== compatibilityArguments.length) {
  throw new Error('Usage: node scripts/test_packed_consumer.mjs [--compatibility=latest|minimum]')
}

export const compatibility = compatibilityArguments[0]?.split('=')[1] ?? 'latest'
if (compatibility !== 'latest' && compatibility !== 'minimum') {
  throw new Error(`Unsupported compatibility mode: ${compatibility}`)
}

export const database = process.env.DB_CLIENT === 'pg' ? 'pg' : 'better-sqlite3'
if (process.env.DB_CLIENT && !['pg', 'better-sqlite3', 'sqlite'].includes(process.env.DB_CLIENT)) {
  throw new Error(`Unsupported DB_CLIENT for the installed-consumer gate: ${process.env.DB_CLIENT}`)
}

export const tempRoot = await mkdtemp(join(tmpdir(), 'lucid-soft-deletes-consumer-'))

export function appEnvironment(appRoot) {
  const environment = {
    ...process.env,
    CI: 'true',
    NODE_ENV: 'test',
    PORT: process.env.PORT ?? '3333',
    HOST: process.env.HOST ?? 'localhost',
    APP_URL: process.env.APP_URL ?? 'http://localhost:3333',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'error',
    APP_KEY: process.env.APP_KEY ?? 'base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    DB_CLIENT: database,
  }
  if (database === 'better-sqlite3') {
    environment.DB_DATABASE = join(appRoot, 'tmp', 'consumer.sqlite3')
  }
  return environment
}
