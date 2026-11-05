import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { copyFixture } from '../../bin/helpers/consumer/fixture.js'

test.group('consumer fixture inputs', (group) => {
  let directory: string
  let source: string
  let destination: string

  group.each.setup(async () => {
    directory = await mkdtemp(join(tmpdir(), 'soft-delete-consumer-inputs-'))
    source = join(directory, 'source')
    destination = join(directory, 'application')
    await mkdir(source)
  })
  group.each.teardown(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  test('copies ordinary inputs without requiring a Git index', async ({ assert }) => {
    await writeFile(join(source, 'untracked.ts'), 'export const value = 1\n')
    await copyFixture(source, destination)
    assert.equal(
      await readFile(join(destination, 'untracked.ts'), 'utf8'),
      'export const value = 1\n'
    )
    assert.deepEqual(await readdir(join(destination, 'tmp')), [])
  })

  test('filters artifacts and environment files recursively while retaining env examples', async ({
    assert,
  }) => {
    const omitted = ['node_modules', 'tmp', 'build', '.adonisjs', '.git']
    for (const prefix of ['', 'app']) {
      await mkdir(join(source, prefix), { recursive: true })
      for (const name of omitted) {
        await mkdir(join(source, prefix, name))
        await writeFile(join(source, prefix, name, 'excluded.txt'), 'fixture artifact')
      }
      for (const name of ['.env', '.env.local', '.env.test', '.env.example']) {
        await writeFile(join(source, prefix, name), 'FIXTURE_VALUE=example\n')
      }
    }
    await copyFixture(source, destination)
    const copiedPaths = await readdir(destination)
    assert.deepEqual(copiedPaths.sort(), ['.env.example', 'app', 'tmp'])
    assert.deepEqual(await readdir(join(destination, 'app')), ['.env.example'])
    assert.deepEqual(await readdir(join(destination, 'tmp')), [])
    assert.equal(
      await readFile(join(destination, '.env.example'), 'utf8'),
      'FIXTURE_VALUE=example\n'
    )
    assert.equal(
      await readFile(join(destination, 'app', '.env.example'), 'utf8'),
      'FIXTURE_VALUE=example\n'
    )
  })
})
