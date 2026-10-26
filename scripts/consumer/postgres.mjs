/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { run } from './harness.mjs'

const appSchemaCheck = `import pg from 'pg'
const client = new pg.Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
})
await client.connect()
try {
  const { rows } = await client.query('SELECT current_schema() AS schema')
  process.stdout.write(rows[0].schema)
} finally {
  await client.end()
}
`

function connection(environment) {
  assert.ok(environment.DB_DATABASE, 'DB_DATABASE is required for the PostgreSQL consumer gate')
  return new pg.Client({
    host: environment.DB_HOST,
    port: environment.DB_PORT ? Number(environment.DB_PORT) : undefined,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    database: environment.DB_DATABASE,
  })
}

function combineFailure(previous, next) {
  return previous
    ? new AggregateError([previous, next], 'PostgreSQL consumer cleanup failed')
    : next
}

/** Run one consumer against an empty, disposable PostgreSQL schema. */
export async function withPostgresSchema(environment, action) {
  if (environment.DB_CLIENT !== 'pg') return action(environment)

  const schema = `lucid_soft_deletes_consumer_${randomUUID().replaceAll('-', '')}`
  const client = connection(environment)
  await client.connect()
  let created = false
  let result
  let failure
  try {
    await client.query(`CREATE SCHEMA "${schema}"`)
    created = true
    console.log(`Created isolated PostgreSQL schema: ${schema}`)
    result = await action(
      { ...environment, PGOPTIONS: `-c search_path=${schema}`, DB_SCHEMA: schema },
      schema,
      client
    )
  } catch (error) {
    failure = error
  }

  try {
    if (created) {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`)
      console.log(`Removed isolated PostgreSQL schema: ${schema}`)
    }
  } catch (error) {
    failure = combineFailure(failure, error)
  }
  try {
    await client.end()
  } catch (error) {
    failure = combineFailure(failure, error)
  }
  if (failure) throw failure
  return result
}

/** Confirm the fixture migration created its table in this run's schema. */
export async function verifyPostgresMigration(client, schema) {
  const { rows } = await client.query(
    'SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename',
    [schema]
  )
  assert.ok(
    rows.some(({ tablename }) => tablename === 'users'),
    `Consumer migration did not create users in isolated PostgreSQL schema ${schema}`
  )
}

/** Ensure the installed app's pg driver honors the isolated search path. */
export async function verifyAppPostgresSchema(appRoot, environment, schema) {
  const script = join(appRoot, 'tmp', 'check_postgres_schema.mjs')
  await writeFile(script, appSchemaCheck)
  try {
    const current = run(process.execPath, ['tmp/check_postgres_schema.mjs'], appRoot, environment)
    assert.equal(current.trim(), schema, 'The consumer app did not select its isolated schema')
  } finally {
    await rm(script)
  }
}
