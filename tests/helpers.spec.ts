import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'

const root = fileURLToPath(new URL('..', import.meta.url))
const helpers = fileURLToPath(new URL('./helpers.ts', import.meta.url))

/** Loads tests/helpers.ts in a fresh process, so its import-time DB_CLIENT check runs. */
function loadHelpers(dbClient: string | undefined) {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (dbClient === undefined) delete env.DB_CLIENT
  else env.DB_CLIENT = dbClient
  return spawnSync(process.execPath, ['--import=@poppinss/ts-exec', helpers], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
}

test.group('Test helpers DB_CLIENT', () => {
  test('rejects DB_CLIENT values outside pg, mysql2 and better-sqlite3')
    .with(['postgres', 'mysql', 'sqlite'])
    .run(({ assert }, dbClient) => {
      const result = loadHelpers(dbClient)
      assert.notEqual(result.status, 0)
      assert.include(result.stderr, `Unsupported DB_CLIENT: ${dbClient}`)
    })

  test('loads with an unset DB_CLIENT or a supported value', ({ assert }) => {
    for (const dbClient of [undefined, 'pg', 'mysql2', 'better-sqlite3']) {
      const result = loadHelpers(dbClient)
      assert.equal(result.status, 0, result.stderr)
    }
  })
})
