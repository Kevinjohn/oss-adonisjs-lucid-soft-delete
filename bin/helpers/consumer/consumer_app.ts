/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import assert from 'node:assert/strict'
import { readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { copyFixture } from './fixture.js'
import { runCommand } from './harness.js'
import { verifyAppPostgresSchema, verifyPostgresMigration, withPostgresSchema } from './postgres.js'
import {
  readConsumerEnvironment,
  compatibility,
  fixtureRoot,
  packageName,
  repoRoot,
  tempRoot,
} from './settings.js'

const minimumPeers = {
  '@adonisjs/assembler': '8.0.0',
  '@adonisjs/core': '7.0.0',
  '@adonisjs/lucid': '22.0.0',
}

async function installPackedPackage(appRoot: string, archive: string) {
  const manifestPath = join(appRoot, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies ??= {}
  manifest.dependencies[packageName] = `file:${archive}`
  // Compile the same freshly installed declarations with both advertised compiler versions.
  manifest.devDependencies.typescript6 = 'npm:typescript@6.0.3'
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
  runCommand({ command: 'pnpm', args: ['install', '--no-frozen-lockfile'], cwd: appRoot })
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

async function verifyPublicApi(appRoot: string, environment: NodeJS.ProcessEnv) {
  await writeFile(
    join(appRoot, 'package_exports.ts'),
    `import { compose } from '@adonisjs/core/helpers'
import { BaseModel } from '@adonisjs/lucid/orm'
import { SOFT_DELETES, SoftDeletes, hasSoftDeletes } from '${packageName}'
import type { SoftDeleteReceipt, BulkReceiptOptions, SoftDeletesInstance } from '${packageName}/types'
import type { SoftDeleteReceipt as CompatibilityReceipt } from '${packageName}/types/index'
import type {} from '${packageName}/types/querybuilder'
import Provider from '${packageName}/lucid_soft_delete_provider'
import { extendModelQueryBuilder } from '${packageName}/bindings'

class Example extends compose(BaseModel, SoftDeletes) {}
export function verifyContract(candidate: unknown, model: typeof BaseModel, example: Example, options: BulkReceiptOptions) {
  const instance: SoftDeletesInstance = example
  const receipt: Promise<SoftDeleteReceipt> = Example.query().onlyTrashed().softDelete({ receipt: true })
  const compatibilityReceipt: Promise<CompatibilityReceipt> = receipt
  const count: Promise<number> = Example.query().withTrashed().restore()
  if (hasSoftDeletes(candidate)) {
    const marker: true = candidate[SOFT_DELETES]
    void marker
    // @ts-expect-error An unknown value gains only the marker.
    void candidate.query
  }
  if (hasSoftDeletes(model)) model.query().withTrashed()
  return [instance, receipt, compatibilityReceipt, count, options, Provider, extendModelQueryBuilder]
}
`
  )

  runCommand({
    command: process.execPath,
    args: [
      '--input-type=module',
      '-e',
      `import assert from 'node:assert/strict'; import { errors } from '${packageName}'; const error = new errors.E_MODEL_SOFT_DELETE('User'); assert.ok(error instanceof errors.ModelSoftDeleteException); assert.equal(error.code, 'E_MODEL_SOFT_DELETE')`,
    ],
    cwd: appRoot,
    environment,
  })
}

/** Exercise distinct compiler executables, even if pnpm's shared tsc shim selects one. */
function typecheckPublicApi(appRoot: string, environment: NodeJS.ProcessEnv) {
  for (const [name, version] of [
    ['typescript', '5.9.3'],
    ['typescript6', '6.0.3'],
  ]) {
    const compiler = `node_modules/${name}/bin/tsc`
    assert.equal(
      runCommand({
        command: process.execPath,
        args: [compiler, '--version'],
        cwd: appRoot,
        environment,
      }).trim(),
      `Version ${version}`
    )
    runCommand({
      command: process.execPath,
      args: [compiler, '--noEmit'],
      cwd: appRoot,
      environment,
    })
  }
}

function runAceCommand(
  appRoot: string,
  environment: NodeJS.ProcessEnv,
  command: string,
  ...arguments_: string[]
) {
  runCommand({
    command: process.execPath,
    args: ['ace', command, ...arguments_],
    cwd: appRoot,
    environment,
  })
}

async function configureTwice(appRoot: string, environment: NodeJS.ProcessEnv) {
  const countRegistrations = async () => {
    const rc = await readFile(join(appRoot, 'adonisrc.ts'), 'utf8')
    return (rc.match(/@kevinjohn\/adonisjs-lucid-soft-delete\/lucid_soft_delete_provider/g) ?? [])
      .length
  }

  assert.equal(await countRegistrations(), 0, 'The fixture must start without the package provider')
  runAceCommand(appRoot, environment, 'configure', packageName)
  assert.equal(await countRegistrations(), 1, 'Configure must register the provider once')
  runAceCommand(appRoot, environment, 'configure', packageName)
  assert.equal(await countRegistrations(), 1, 'Repeated configure must not duplicate the provider')
}

async function verifyConfiguredProviderResolves(appRoot: string, environment: NodeJS.ProcessEnv) {
  const rc = await readFile(join(appRoot, 'adonisrc.ts'), 'utf8')
  assert.match(
    rc,
    /@kevinjohn\/adonisjs-lucid-soft-delete\/lucid_soft_delete_provider/,
    'Configure must register the renamed provider export'
  )
  runCommand({
    command: process.execPath,
    args: [
      '--input-type=module',
      '-e',
      "await import('@kevinjohn/adonisjs-lucid-soft-delete/lucid_soft_delete_provider'); try { await import('@kevinjohn/adonisjs-lucid-soft-delete/provider'); throw new Error('The old provider subpath must not be exported') } catch (error) { if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error }",
    ],
    cwd: appRoot,
    environment,
  })
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
  return withPostgresSchema(
    readConsumerEnvironment(appRoot),
    async (environment, schema, client) => {
      await verifyPublicApi(appRoot, environment)
      if (schema) await verifyAppPostgresSchema(appRoot, environment, schema)
      await configureTwice(appRoot, environment)
      await verifyConfiguredProviderResolves(appRoot, environment)
      runAceCommand(appRoot, environment, 'schema:generate')
      runAceCommand(appRoot, environment, 'migration:run')
      if (schema && client) await verifyPostgresMigration(client, schema)
      await verifyGeneratedSchema(appRoot)
      typecheckPublicApi(appRoot, environment)
      runAceCommand(appRoot, environment, 'build')
      runAceCommand(appRoot, environment, 'test')

      return { appRoot, ...installed }
    }
  )
}
