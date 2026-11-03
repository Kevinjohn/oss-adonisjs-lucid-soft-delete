/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import assert from 'node:assert/strict'
import { readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { copyFixture } from './fixture.js'
import { run } from './harness.js'
import { verifyAppPostgresSchema, verifyPostgresMigration, withPostgresSchema } from './postgres.js'
import {
  appEnvironment,
  compatibility,
  fixtureRoot,
  packageName,
  repoRoot,
  tempRoot,
} from './settings.js'

const minimumPeers = {
  '@adonisjs/core': '7.0.0',
  '@adonisjs/lucid': '22.0.0',
}

async function installPackedPackage(appRoot: string, archive: string) {
  const manifestPath = join(appRoot, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies ??= {}
  manifest.dependencies[packageName] = `file:${archive}`
  if (compatibility === 'minimum') {
    for (const [name, version] of Object.entries(minimumPeers)) {
      delete manifest.devDependencies?.[name]
      manifest.dependencies[name] = version
    }
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  if (compatibility === 'latest') {
    await rm(join(appRoot, 'pnpm-lock.yaml'))
  }
  run('pnpm', ['install', '--no-frozen-lockfile'], appRoot)
}

async function inspectInstalledPackage(appRoot: string) {
  const packageRoot = join(appRoot, 'node_modules', packageName)
  const installedPath = await realpath(packageRoot)
  const appModules = await realpath(join(appRoot, 'node_modules'))
  const sourceRoot = await realpath(repoRoot)
  assert.ok(
    installedPath.startsWith(`${appModules}${sep}`),
    `Installed package resolves outside the temporary consumer: ${installedPath}`
  )
  assert.ok(
    !installedPath.startsWith(`${sourceRoot}${sep}`),
    `Installed package resolves to repository source: ${installedPath}`
  )

  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(metadata.name, packageName)
  const storeEntries = await readdir(join(appModules, '.pnpm'))
  const copies = storeEntries.filter((entry) =>
    entry.startsWith('@kevinjohn+adonisjs-lucid-soft-delete@')
  )
  assert.equal(copies.length, 1, `Expected one installed package copy; found ${copies.length}`)

  const license = await readFile(join(packageRoot, 'LICENSE.md'), 'utf8')
  assert.match(license, /Copyright \(c\) 2024 Lookin Anton/)
  assert.match(license, /Copyright \(c\) 2026 Kevinjohn Gallagher/)

  const bundle = await readFile(join(packageRoot, 'build/index.js'), 'utf8')
  assert.ok(!bundle.includes('class ModelQueryBuilder'), 'Lucid was bundled into the package')

  return {
    installedPath,
    version: metadata.version,
  }
}

function ace(
  appRoot: string,
  environment: NodeJS.ProcessEnv,
  command: string,
  ...arguments_: string[]
) {
  run(process.execPath, ['ace', command, ...arguments_], appRoot, environment)
}

async function configureTwice(appRoot: string, environment: NodeJS.ProcessEnv) {
  const countRegistrations = async () => {
    const rc = await readFile(join(appRoot, 'adonisrc.ts'), 'utf8')
    return (rc.match(/@kevinjohn\/adonisjs-lucid-soft-delete\/lucid_soft_delete_provider/g) ?? [])
      .length
  }

  assert.equal(await countRegistrations(), 0, 'The fixture must start without the package provider')
  ace(appRoot, environment, 'configure', packageName)
  assert.equal(await countRegistrations(), 1, 'Configure must register the provider once')
  ace(appRoot, environment, 'configure', packageName)
  assert.equal(await countRegistrations(), 1, 'Repeated configure must not duplicate the provider')
}

async function verifyConfiguredProviderResolves(appRoot: string, environment: NodeJS.ProcessEnv) {
  const rc = await readFile(join(appRoot, 'adonisrc.ts'), 'utf8')
  assert.match(
    rc,
    /@kevinjohn\/adonisjs-lucid-soft-delete\/lucid_soft_delete_provider/,
    'Configure must register the renamed provider export'
  )
  run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "await import('@kevinjohn/adonisjs-lucid-soft-delete/lucid_soft_delete_provider'); try { await import('@kevinjohn/adonisjs-lucid-soft-delete/provider'); throw new Error('The old provider subpath must not be exported') } catch (error) { if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error }",
    ],
    appRoot,
    environment
  )
}

async function verifyGeneratedSchema(appRoot: string) {
  const schema = await readFile(join(appRoot, 'database/schema.ts'), 'utf8')
  assert.match(schema, /\bdeletedAt\b/, 'Generated schema must include deletedAt')
}

/** Exercise the packed package as a dependency of a separate AdonisJS application. */
export async function runConsumerApp(archive: string, runName: string) {
  const appRoot = join(tempRoot, runName)
  await copyFixture(fixtureRoot, appRoot)
  await installPackedPackage(appRoot, archive)
  const installed = await inspectInstalledPackage(appRoot)
  return withPostgresSchema(appEnvironment(appRoot), async (environment, schema, client) => {
    if (schema) await verifyAppPostgresSchema(appRoot, environment, schema)
    await configureTwice(appRoot, environment)
    await verifyConfiguredProviderResolves(appRoot, environment)
    ace(appRoot, environment, 'schema:generate')
    ace(appRoot, environment, 'migration:run')
    if (schema && client) await verifyPostgresMigration(client, schema)
    await verifyGeneratedSchema(appRoot)
    run('pnpm', ['exec', 'tsc', '--noEmit'], appRoot, environment)
    ace(appRoot, environment, 'build')
    ace(appRoot, environment, 'test')

    return { appRoot, ...installed }
  })
}
