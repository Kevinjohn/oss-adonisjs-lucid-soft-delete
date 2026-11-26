#!/usr/bin/env node

/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { runFresh } from './helpers/consumer/fresh.ts'
import { runCommand } from './helpers/consumer/harness.ts'
import { runMinimum } from './helpers/consumer/minimum.ts'
import { compatibility, database, repoRoot, tempRoot } from './helpers/consumer/settings.ts'

async function packCandidate() {
  runCommand({ command: 'pnpm', args: ['build'], cwd: repoRoot })
  const destination = join(tempRoot, 'package')
  await mkdir(destination)
  runCommand({ command: 'pnpm', args: ['pack', '--pack-destination', destination], cwd: repoRoot })
  const destinationEntries = await readdir(destination)
  const archives = destinationEntries.filter((name) => name.endsWith('.tgz'))
  if (archives.length !== 1) {
    throw new Error(`Expected one packed package archive; found ${archives.length}`)
  }
  return join(destination, archives[0])
}

try {
  const archive = await packCandidate()
  const result = compatibility === 'minimum' ? await runMinimum(archive) : await runFresh(archive)
  console.log(`\nInstalled-consumer gate passed (${compatibility}, ${database})`)
  console.log(`Installed package: ${result.installedPath}`)
  console.log(`Installed version: ${result.version}`)
  await rm(tempRoot, { recursive: true, force: true })
} catch (error) {
  console.error(error?.stack ?? error)
  console.error(`Consumer run directory kept for inspection: ${tempRoot}`)
  process.exitCode = 1
}
